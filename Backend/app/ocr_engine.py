import re
import os
import cv2
import numpy as np
import requests
from paddleocr import PaddleOCR
from pdf2image import convert_from_path

POPPLER_PATH = r"./poppler-23.11.0/Library/bin"

ocr = PaddleOCR(use_angle_cls=True, lang='en', use_gpu=False)

# -------------------------------
# LOAD INPUT
# -------------------------------
def load_input(file_path):
    ext = os.path.splitext(file_path)[1].lower()

    if ext == ".pdf":
        pages = convert_from_path(file_path, dpi=300, poppler_path=POPPLER_PATH)
        return [np.array(p) for p in pages]

    elif ext in [".png", ".jpg", ".jpeg"]:
        return [cv2.imread(file_path)]

    else:
        raise ValueError("Unsupported file")


# -------------------------------
# PREPROCESS
# -------------------------------
def preprocess(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.resize(gray, None, fx=1.5, fy=1.5)

    _, thresh = cv2.threshold(
        gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU
    )

    return cv2.cvtColor(thresh, cv2.COLOR_GRAY2BGR)


# -------------------------------
# OCR WITH BOXES
# -------------------------------
def extract_with_boxes(img):
    result = ocr.ocr(img, cls=True)
    data = []

    for line in result:
        for word in line:
            box = word[0]
            text = word[1][0]
            x = int(box[0][0])
            y = int(box[0][1])

            data.append({"text": text, "x": x, "y": y})

    return data


# -------------------------------
# GROUP ROWS
# -------------------------------
def group_rows(data, threshold=15):
    rows = []

    for item in data:
        placed = False
        for row in rows:
            if abs(row[0]["y"] - item["y"]) < threshold:
                row.append(item)
                placed = True
                break

        if not placed:
            rows.append([item])

    for row in rows:
        row.sort(key=lambda x: x["x"])

    rows.sort(key=lambda r: r[0]["y"])

    return rows


# -------------------------------
# HEADER
# -------------------------------
def extract_header(rows):
    merchant = rows[0][0]["text"] if rows else None

    date = None
    for row in rows:
        for cell in row:
            match = re.search(r"\d{2}/\d{2}/\d{4}", cell["text"])
            if match:
                date = match.group()

    return merchant, date


# -------------------------------
# TOTAL
# -------------------------------
def extract_total(rows):
    for row in rows:
        text = " ".join([c["text"] for c in row]).lower()
        if "total" in text:
            for cell in row:
                nums = re.findall(r"\d+\.\d+", cell["text"])
                if nums:
                    return float(nums[-1])
    return None


# -------------------------------
# TAX
# -------------------------------
def extract_tax(rows):
    cgst = None
    sgst = None
    total_tax = None

    for row in rows:
        text = " ".join([c["text"] for c in row]).lower()

        if "cgst" in text:
            nums = re.findall(r"\d+\.\d+", text)
            if nums:
                cgst = float(nums[-1])

        elif "sgst" in text:
            nums = re.findall(r"\d+\.\d+", text)
            if nums:
                sgst = float(nums[-1])

        elif "tax" in text:
            nums = re.findall(r"\d+\.\d+", text)
            if nums:
                total_tax = float(nums[-1])

    return {
        "cgst": cgst,
        "sgst": sgst,
        "total_tax": total_tax
    }


# -------------------------------
# ITEMS
# -------------------------------
def extract_items(rows):
    items = []

    # ----------- TRY TABLE FORMAT FIRST -----------
    capture = False

    for row in rows:
        texts = [c["text"] for c in row]
        line = " ".join(texts).lower()

        if "qty" in line and "item" in line:
            capture = True
            continue

        if "subtotal" in line:
            break

        if capture and len(texts) >= 3:
            try:
                qty = int(texts[0])
                name = texts[1]
                amount = float(texts[-1])

                items.append({
                    "name": name,
                    "qty": qty,
                    "price": amount
                })
            except:
                continue

    # ----------- FALLBACK: LINE-BASED PARSING -----------
    if len(items) == 0:
        for row in rows:
            texts = [c["text"] for c in row]
            line = " ".join(texts)

            # Match: "Item $12.50"
            match = re.search(r"(.+?)\s*[$₹€£]\s*(\d+\.\d+)", line)

            if match:
                name = match.group(1).strip()
                price = float(match.group(2))

                # Ignore totals
                if any(word in name.lower() for word in ["total", "tax", "subtotal"]):
                    continue

                items.append({
                    "name": name,
                    "qty": 1,
                    "price": price
                })

    return items


# -------------------------------
# COUNTRY + CURRENCY API
# -------------------------------
country_currency_cache = {}

def load_country_currency():
    global country_currency_cache

    if country_currency_cache:
        return country_currency_cache

    try:
        url = "https://restcountries.com/v3.1/all?fields=name,currencies"
        data = requests.get(url).json()

        for country in data:
            name = country.get("name", {}).get("common", "").lower()
            currencies = country.get("currencies", {})

            if currencies:
                code = list(currencies.keys())[0]
                country_currency_cache[name] = code

    except:
        pass

    return country_currency_cache


def detect_country(text_data):
    text = " ".join([d["text"] for d in text_data]).lower()
    country_map = load_country_currency()

    for country in country_map:
        if country in text:
            return country

    return None


def detect_currency_symbol(text_data):
    text = " ".join([d["text"] for d in text_data])

    if "₹" in text:
        return "INR"
    if "$" in text:
        return "USD"
    if "€" in text:
        return "EUR"
    if "£" in text:
        return "GBP"

    return None


def get_currency(country, text_data):
    country_map = load_country_currency()

    if country and country in country_map:
        return country_map[country]

    return detect_currency_symbol(text_data) or "INR"


# -------------------------------
# CURRENCY CONVERSION
# -------------------------------
def convert_currency(amount, from_currency, to_currency="INR"):
    if not amount or from_currency == to_currency:
        return amount

    try:
        url = f"https://api.exchangerate-api.com/v4/latest/{from_currency}"
        data = requests.get(url).json()
        rate = data["rates"].get(to_currency)

        if rate:
            return round(amount * rate, 2)

    except:
        pass

    return amount


# -------------------------------
# CATEGORY + DESCRIPTION
# -------------------------------
def detect_category(merchant, items):
    text = (merchant + " " + " ".join([i["name"] for i in items])).lower()

    if any(w in text for w in ["cafe", "restaurant", "food", "coffee"]):
        return "Food"

    return "Other"


def generate_description(merchant):
    return f"Expense at {merchant}"


# -------------------------------
# MAIN
# -------------------------------
def process_receipt(file_path):
    images = load_input(file_path)
    results = []

    for img in images:
        img = preprocess(img)

        data = extract_with_boxes(img)
        rows = group_rows(data)

        merchant, date = extract_header(rows)
        total = extract_total(rows)
        items = extract_items(rows)
        tax = extract_tax(rows)

        country = detect_country(data)
        currency = get_currency(country, data)
        converted_total = convert_currency(total, currency)

        category = detect_category(merchant, items)
        description = generate_description(merchant)

        results.append({
            "merchant": merchant or "N/A",
            "date": date or "N/A",
            "total": total or 0,
            "converted_total": converted_total or 0,
            "currency": currency or "INR",
            "country": country or "Unknown",
            "category": category or "Other",
            "description": description or "",
            "tax": tax or {"cgst": 0, "sgst": 0},
            "items": items or []
        })

    return results