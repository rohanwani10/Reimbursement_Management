#!/bin/bash
# Test OCR endpoint locally
curl -X POST http://localhost:8000/ocr/extract \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "test-123",
    "expenseId": "exp-456",
    "receiptUrl": "https://via.placeholder.com/150",
    "mimeType": "image/png",
    "hints": {
      "companyCurrency": "USD",
      "locale": "en-US"
    }
  }' 2>&1 | head -50
