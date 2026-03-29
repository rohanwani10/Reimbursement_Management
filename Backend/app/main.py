from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.schemas import OCRExtractRequest, OCRExtractResponse
from app.services.ocr import extract_receipt

app = FastAPI(
    title="Reimbursement OCR Service",
    version="0.2.0",
    description="Asynchronous-style OCR worker service with a JSON job contract.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": settings.app_name,
        "environment": settings.app_env,
        "provider": settings.ocr_provider,
    }


@app.post("/ocr/extract", response_model=OCRExtractResponse)
async def ocr_extract(payload: OCRExtractRequest) -> OCRExtractResponse:
    return await extract_receipt(payload)
