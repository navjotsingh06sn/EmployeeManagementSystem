"""Shared employee, invitation, and document operations."""

import logging
import re
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from urllib.parse import quote

import jwt
from bson import ObjectId
from fastapi import HTTPException, Response, status
from pymongo import DESCENDING, ReturnDocument

from backend.app.ocr_service import extract_document_text
from backend.app.config import (
    FRONTEND_URL,
    SECRET_KEY,
    SMTP_FROM_EMAIL,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_USERNAME,
)
from backend.app.database import counters, db, documents_bucket, employees, users

class EmailConfigurationError(RuntimeError):
    pass

def log_invitation_error(error: Exception) -> None:
    # Show SMTP diagnostics without printing credentials to the terminal.
    detail = str(error)
    for secret in (SMTP_PASSWORD, SMTP_USERNAME, SMTP_FROM_EMAIL):
        if secret:
            detail = detail.replace(secret, "[redacted]")
    logging.error("Employee invitation failed (%s): %s", type(error).__name__, detail)


def invitation_error_detail(error: Exception) -> str:
    if isinstance(error, EmailConfigurationError):
        return (
            "Email invites are not configured. Set SMTP_HOST, SMTP_USERNAME, "
            "and SMTP_PASSWORD in the project .env file, then restart the backend."
        )
    return "Could not send the employee invitation. Check the email settings and try again."


def next_employee_number() -> int:
    counter = counters.find_one_and_update(
        {"_id": "employee_number"},
        {"$inc": {"value": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return counter["value"]


def public_document(document) -> dict:
    metadata = document.metadata or {}
    return {
        "id": str(document._id),
        "filename": document.filename,
        "content_type": metadata.get("content_type", "application/octet-stream"),
        "document_type": metadata.get("document_type", "document"),
        "size_bytes": document.length,
        "uploaded_at": document.upload_date.isoformat(),
    }


def employee_documents(employee_id: str) -> list[dict]:
    return [
        public_document(document)
        for document in documents_bucket.find(
            {"metadata.employee_id": employee_id}
        ).sort("uploadDate", DESCENDING)
    ]


def document_ocr_text(document) -> str:
    metadata = document.metadata or {}
    text = metadata.get("ocr_text", "")
    if metadata.get("document_type") != "aadhaar" or "XXXX" not in text.upper():
        return text

    # Refresh OCR for cards uploaded before unmasked details were enabled.
    try:
        image = documents_bucket.open_download_stream(document._id)
        text = extract_document_text(image.read(), document_type="aadhaar")
    except HTTPException:
        return text
    db["employee_documents.files"].update_one(
        {"_id": document._id},
        {"$set": {"metadata.ocr_text": text}},
    )
    return text


def admin_employee_documents(employee_id: str) -> list[dict]:
    documents = []
    cursor = documents_bucket.find(
        {"metadata.employee_id": employee_id}
    ).sort("uploadDate", DESCENDING)

    for document in cursor:
        document_data = public_document(document)
        ocr_text = document_ocr_text(document)
        document_data["ocr_text"] = ocr_text
        detected_type = detect_document_type(ocr_text, document_data["document_type"])
        document_data["document_type"] = detected_type
        document_data["ocr_details"] = extract_document_details(ocr_text, detected_type)
        documents.append(document_data)

    return documents


def detect_document_type(text: str, fallback: str = "document") -> str:
    """Identify common Indian documents with local OCR text patterns."""
    normalized = text.upper()
    pan_number = re.search(r"\b[A-Z]{5}\s?\d{4}\s?[A-Z]\b", normalized)
    if (
        pan_number
        or "PERMANENT ACCOUNT NUMBER" in normalized
        or "INCOME TAX DEPARTMENT" in normalized
    ):
        return "pan"
    has_aadhaar_number = bool(re.search(r"(?<!\d)(?:\d[\s-]*){11}\d(?!\d)", text))
    has_aadhaar_label = any(
        label in normalized
        for label in ("AADHAAR", "UIDAI", "UNIQUE IDENTIFICATION")
    )
    if has_aadhaar_label or (has_aadhaar_number and "GOVERNMENT OF INDIA" in normalized):
        return "aadhaar"
    if fallback in {"aadhaar", "pan", "resume"}:
        return fallback
    is_resume = any(
        word in normalized
        for word in ("RESUME", "CURRICULUM VITAE", "EXPERIENCE", "EDUCATION")
    )
    return "resume" if is_resume else "document"


def extract_document_details(text: str, document_type: str) -> dict[str, str]:
    """Return only fields visibly supported by the OCR text."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    normalized = "\n".join(lines)
    details: dict[str, str] = {}

    def labeled_value(pattern: str) -> str:
        match = re.search(pattern + r"\s*[:\-]?\s*([^\n]+)?", normalized, re.I)
        if match and match.group(1):
            return match.group(1).strip(" :-")
        if match:
            following = normalized[match.end():].splitlines()
            if following:
                return following[0].strip(" :-")
        return ""

    name = labeled_value(r"\bname\b")
    father = labeled_value(r"(?:father(?:'s)?(?:\s+name)?|s/o|d/o|w/o|c/o|care\s+of)")
    address = labeled_value(r"\baddress\b")
    aadhaar_match = re.search(
        r"(?<!\d)(?:\d[\s-]*){11}\d(?!\d)", normalized
    ) if document_type == "aadhaar" else None
    pan_match = (
        re.search(r"\b[A-Z]{5}\s?\d{4}\s?[A-Z]\b", normalized, re.I)
        if document_type == "pan"
        else None
    )
    email_match = re.search(
        r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", normalized, re.I
    )
    phone_source = normalized
    if aadhaar_match:
        phone_source = phone_source.replace(aadhaar_match.group(0), " ")
    phone_match = re.search(
        r"(?<!\d)(?:\+91[\s-]?)?[6-9](?:[\s-]?\d){9}(?!\d)",
        phone_source,
    )

    candidates = {
        "name": name,
        "father_name": father,
        "address": address,
        "phone": phone_match.group(0).strip() if phone_match else "",
        "date_of_birth": labeled_value(r"(?:date\s+of\s+birth|dob)") or labeled_value(r"\byob\b"),
        "gender": labeled_value(r"\b(?:gender|sex)\b"),
        "aadhaar_number": (
            " ".join(aadhaar_match.group(0).replace("-", " ").split())
            if aadhaar_match
            else ""
        ),
        "pan_number": re.sub(r"\s+", "", pan_match.group(0)).upper() if pan_match else "",
        "email": email_match.group(0) if email_match else "",
        "education": labeled_value(r"\b(?:education|qualification|degree)\b"),
        "experience": labeled_value(r"\b(?:experience|work experience)\b"),
        "skills": labeled_value(r"\bskills?\b"),
    }
    return {key: value for key, value in candidates.items() if value}


def document_download(document_id: str, employee_id: str) -> Response:
    if not ObjectId.is_valid(document_id):
        raise HTTPException(status_code=400, detail="Invalid document ID.")

    document_oid = ObjectId(document_id)
    document_file = db["employee_documents.files"].find_one(
        {
            "_id": document_oid,
            "metadata.employee_id": employee_id,
        }
    )
    if document_file is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    document = documents_bucket.open_download_stream(document_oid)
    filename = document.filename.replace("\r", "").replace("\n", "")
    return Response(
        content=document.read(),
        media_type=(document.metadata or {}).get(
            "content_type", "application/octet-stream"
        ),
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}",
            "X-Content-Type-Options": "nosniff",
        },
    )


def send_employee_invitation(employee: dict, user: dict) -> None:
    if not all((SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM_EMAIL)):
        raise EmailConfigurationError("Email delivery is not configured.")

    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    invite_token = jwt.encode(
        {
            "sub": str(user["_id"]),
            "email": employee["email"],
            "purpose": "employee_invite",
            "exp": expires_at,
        },
        SECRET_KEY,
        algorithm="HS256",
    )
    setup_url = f"{FRONTEND_URL}/login?invite_token={invite_token}"

    message = EmailMessage()
    message["Subject"] = "Set up your PeopleDesk employee account"
    message["From"] = SMTP_FROM_EMAIL
    message["To"] = employee["email"]
    message.set_content(
        "Hello,\n\n"
        "You have been invited to join PeopleDesk. Follow these steps to "
        "activate your employee account:\n\n"
        "1. Open the secure setup link below within 24 hours.\n"
        "2. On the page, enter your name, department, contact number, and "
        "address, then create and confirm your password.\n"
        "3. Sign in using this email address as your username and the password "
        "you created.\n\n"
        f"Your employee ID (serial number) is {employee['employee_number']}.\n\n"
        f"{setup_url}\n\n"
        "If you were not expecting this invitation, you can ignore this email."
    )

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as mail_server:
        mail_server.starttls()
        mail_server.login(SMTP_USERNAME, SMTP_PASSWORD)
        mail_server.send_message(message)


def public_employee(employee: dict, account_status: str = "no_account") -> dict:
    return {
        "id": str(employee["_id"]),
        "employee_number": employee["employee_number"],
        "name": employee["name"],
        "email": str(employee["email"]),
        "department": employee["department"],
        "contact_number": employee.get("contact_number", ""),
        "address": employee.get("address", ""),
        "is_active": employee.get("is_active", True),
        "has_account": account_status != "no_account",
        "account_status": account_status,
    }


def employee_account_status(employee_id: str) -> str:
    account = users.find_one({"employee_id": employee_id}, {"status": 1})

    if account is None:
        return "no_account"

    return account.get("status", "approved")
