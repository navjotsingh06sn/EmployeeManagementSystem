"""MongoDB client, collections, and GridFS configuration."""

from gridfs import GridFSBucket
from pymongo import MongoClient

from backend.app.config import DATABASE_NAME, MONGODB_URL

client = MongoClient(MONGODB_URL, serverSelectionTimeoutMS=5000)
db = client[DATABASE_NAME]

employees = db["employees"]
users = db["users"]
counters = db["counters"]
documents_bucket = GridFSBucket(db, bucket_name="employee_documents")

MAX_DOCUMENT_SIZE = 10 * 1024 * 1024
DOCUMENT_SIGNATURES = {
    ".png": ("image/png", lambda content: content.startswith(b"\x89PNG\r\n\x1a\n")),
    ".jpg": ("image/jpeg", lambda content: content.startswith(b"\xff\xd8\xff")),
    ".jpeg": ("image/jpeg", lambda content: content.startswith(b"\xff\xd8\xff")),
    ".pdf": ("application/pdf", lambda content: content.startswith(b"%PDF-")),
}
