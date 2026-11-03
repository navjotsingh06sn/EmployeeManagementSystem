"""Shared employee, invitation, and document operations."""

import logging
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from urllib.parse import quote

import jwt
from bson import ObjectId
from fastapi import HTTPException, Response, status
from pymongo import DESCENDING, ReturnDocument

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


def admin_employee_documents(employee_id: str) -> list[dict]:
    documents = []
    cursor = documents_bucket.find(
        {"metadata.employee_id": employee_id}
    ).sort("uploadDate", DESCENDING)

    for document in cursor:
        document_data = public_document(document)
        document_data["ocr_text"] = (document.metadata or {}).get("ocr_text", "")
        documents.append(document_data)

    return documents


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
