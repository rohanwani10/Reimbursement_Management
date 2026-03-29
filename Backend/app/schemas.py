from datetime import date
from typing import Any

from pydantic import BaseModel, Field, HttpUrl


class OCRHints(BaseModel):
    currency_code: str | None = Field(default=None, alias="currencyCode")
    locale: str | None = None


class OCRExtractRequest(BaseModel):
    expense_id: str = Field(alias="expenseId")
    receipt_url: HttpUrl = Field(alias="receiptUrl")
    hints: OCRHints | None = None


class OCRLineItem(BaseModel):
    description: str
    amount: float | None = None
    quantity: float | None = None


class OCRExtractResponse(BaseModel):
    expense_id: str = Field(alias="expenseId")
    status: str
    merchant: str | None = None
    amount: float | None = None
    currency_code: str | None = Field(default=None, alias="currencyCode")
    expense_date: date | None = Field(default=None, alias="expenseDate")
    raw_text: str = Field(alias="rawText")
    line_items: list[OCRLineItem] = Field(default_factory=list, alias="lineItems")
    confidence: float
    warnings: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
