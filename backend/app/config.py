"""Environment-backed application settings."""

import os
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")

MONGODB_URL = os.getenv("MONGODB_URL")
DATABASE_NAME = os.getenv("DATABASE_NAME", "employee_db")
SECRET_KEY = os.getenv("SECRET_KEY")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "").strip().lower()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").strip().rstrip("/")
if FRONTEND_URL and "://" not in FRONTEND_URL:
    FRONTEND_URL = f"https://{FRONTEND_URL}"
TESSERACT_CMD = os.getenv("TESSERACT_CMD", "").strip()
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", SMTP_USERNAME)

if not MONGODB_URL:
    raise RuntimeError("MONGODB_URL is missing from .env")
if not SECRET_KEY or len(SECRET_KEY) < 32:
    raise RuntimeError("Add a SECRET_KEY of at least 32 characters to .env")
if not ADMIN_EMAIL or len(ADMIN_PASSWORD) < 8:
    raise RuntimeError(
        "Add ADMIN_EMAIL and an ADMIN_PASSWORD of at least 8 characters to .env"
    )
