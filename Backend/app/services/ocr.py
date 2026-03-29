from __future__ import annotations

from datetime import date
from datetime import datetime

import httpx

from app.config import settings
from app.ocr_engine import process_receipt_bytes
from app.schemas import OCRExtractRequest, OCRExtractResponse, OCRLineItem

_ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
}


class OCREngineError(Exception):
    pass


def _normalize_iso_date(raw: str | None) -> date | None:
    if not raw:
        return None

    candidate = raw.strip()
    date_formats = ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y"]
    for fmt in date_formats:
        try:
            return datetime.strptime(candidate, fmt).date()
        except ValueError:
            continue

    return None


def _extract_line_items(raw_line_items: list[dict]) -> list[OCRLineItem]:
    line_items: list[OCRLineItem] = []
    for item in raw_line_items:
        description = str(item.get("description", "")).strip()
        if not description:
            continue
        amount = item.get("amount")
        quantity = item.get("quantity")

        line_items.append(
            OCRLineItem(
                description=description,
                amount=float(amount) if amount is not None else None,
                quantity=float(quantity) if quantity is not None else None,
            )
        )
    return line_items


async def _download_receipt(payload: OCRExtractRequest) -> tuple[bytes, str]:
    requested_mime = payload.mime_type.lower().strip()
    if requested_mime not in _ALLOWED_MIME_TYPES:
        raise OCREngineError(f"Unsupported mimeType: {requested_mime}")

    timeout = httpx.Timeout(settings.receipt_fetch_timeout_seconds)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        response = await client.get(str(payload.receipt_url))

    if response.status_code != 200:
        raise OCREngineError(
            f"Receipt fetch failed with status {response.status_code}"
        )

    content_type = response.headers.get("content-type", "").lower().split(";")[0]
    if content_type and content_type not in _ALLOWED_MIME_TYPES:
        raise OCREngineError(f"Downloaded receipt has unsupported content-type: {content_type}")

    body = response.content
    if len(body) > settings.max_receipt_bytes:
        raise OCREngineError(
            f"Receipt exceeds max size limit ({settings.max_receipt_bytes} bytes)"
        )

    resolved_mime = content_type or requested_mime
    if resolved_mime not in _ALLOWED_MIME_TYPES:
        raise OCREngineError(f"Resolved mime type is unsupported: {resolved_mime}")

    return body, resolved_mime


async def extract_receipt(payload: OCRExtractRequest) -> OCRExtractResponse:
    provider_metadata = {
        "provider": settings.ocr_provider,
        "providerVersion": settings.ocr_provider_version,
    }

    try:
        file_bytes, resolved_mime = await _download_receipt(payload)
        provider_metadata["resolvedMimeType"] = resolved_mime

        engine_result = process_receipt_bytes(file_bytes, resolved_mime)

        merchant = engine_result.get("merchant")
        amount = engine_result.get("amount")
        currency_code = engine_result.get("currencyCode")
        expense_date = _normalize_iso_date(engine_result.get("expenseDate"))
        raw_text = str(engine_result.get("rawText") or "")
        confidence = float(engine_result.get("confidence") or 0.0)
        warnings = [str(message) for message in (engine_result.get("warnings") or [])]
        raw_line_items = engine_result.get("lineItems") or []
        line_items = _extract_line_items(raw_line_items)

        return OCRExtractResponse(
            requestId=payload.request_id,
            expenseId=payload.expense_id,
            status="completed",
            rawText=raw_text,
            merchant=str(merchant) if merchant else None,
            amount=float(amount) if amount is not None else None,
            currencyCode=str(currency_code) if currency_code else None,
            expenseDate=expense_date,
            lineItems=line_items,
            confidence=confidence,
            warnings=warnings,
            providerMetadata={
                **provider_metadata,
                **(engine_result.get("providerMetadata") or {}),
            },
            errorMessage=None,
        )

    except Exception as exc:
        return OCRExtractResponse(
            requestId=payload.request_id,
            expenseId=payload.expense_id,
            status="failed",
            rawText="",
            merchant=None,
            amount=None,
            currencyCode=payload.hints.company_currency if payload.hints else None,
            expenseDate=None,
            lineItems=[],
            confidence=0.0,
            warnings=["OCR extraction failed"],
            providerMetadata=provider_metadata,
            errorMessage=str(exc),
        )
