from fastapi import FastAPI

from app.config import settings
from app.schemas import OCRExtractRequest, OCRExtractResponse
from app.services.ocr import extract_receipt

app = FastAPI(
    title="Reimbursement OCR Service",
    version="0.1.0",
    description="OCR-only microservice for receipt extraction.",
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": settings.app_name,
        "environment": settings.app_env,
    }


@app.post("/ocr/extract", response_model=OCRExtractResponse)
async def ocr_extract(payload: OCRExtractRequest) -> OCRExtractResponse:
    return await extract_receipt(payload)
