from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "reimbursement-ocr-service"
    app_env: str = Field(default="development")
    max_receipt_bytes: int = Field(default=10 * 1024 * 1024)

    class Config:
        env_file = ".env"
        env_prefix = "OCR_"


settings = Settings()
