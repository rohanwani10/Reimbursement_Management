from app.schemas import OCRExtractRequest, OCRExtractResponse


async def extract_receipt(payload: OCRExtractRequest) -> OCRExtractResponse:
    """
    Placeholder extractor.

    Replace this with a real OCR provider or local pipeline once the receipt
    ingestion flow is wired from Convex.
    """

    currency_code = payload.hints.currency_code if payload.hints else None
    warnings = ["OCR pipeline not connected; returning scaffold response."]

    return OCRExtractResponse(
        expenseId=payload.expense_id,
        status="completed",
        merchant=None,
        amount=None,
        currencyCode=currency_code,
        expenseDate=None,
        rawText="",
        lineItems=[],
        confidence=0.0,
        warnings=warnings,
        metadata={"sourceReceiptUrl": str(payload.receipt_url)},
    )
