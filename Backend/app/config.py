from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "reimbursement-ocr-service"
    app_env: str = Field(default="development")
    ocr_provider: str = Field(default="paddleocr-local")
    ocr_provider_version: str = Field(default="1.0")
    max_receipt_bytes: int = Field(default=10 * 1024 * 1024)
    receipt_fetch_timeout_seconds: int = Field(default=20)

    class Config:
        env_file = ".env"
        env_prefix = "OCR_"


settings = Settings()
