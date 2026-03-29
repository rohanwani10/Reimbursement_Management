from datetime import date
from typing import Literal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class OCRHints(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    company_currency: str | None = Field(default=None, alias="companyCurrency")
    locale: str | None = None


class OCRExtractRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    request_id: str = Field(alias="requestId", min_length=3, max_length=128)
    expense_id: str = Field(alias="expenseId")
    receipt_url: HttpUrl = Field(alias="receiptUrl")
    mime_type: str = Field(alias="mimeType", min_length=3, max_length=128)
    hints: OCRHints | None = None


class OCRLineItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    description: str
    amount: float | None = None
    quantity: float | None = None


class OCRExtractResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    request_id: str = Field(alias="requestId")
    expense_id: str = Field(alias="expenseId")
    status: Literal["completed", "failed"]
    raw_text: str = Field(alias="rawText")
    merchant: str | None = None
    amount: float | None = None
    currency_code: str | None = Field(default=None, alias="currencyCode")
    expense_date: date | None = Field(default=None, alias="expenseDate")
    line_items: list[OCRLineItem] = Field(default_factory=list, alias="lineItems")
    confidence: float
    warnings: list[str] = Field(default_factory=list)
    provider_metadata: dict[str, Any] = Field(default_factory=dict, alias="providerMetadata")
    error_message: str | None = Field(default=None, alias="errorMessage")
