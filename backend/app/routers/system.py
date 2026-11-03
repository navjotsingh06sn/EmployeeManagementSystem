from fastapi import APIRouter

from backend.app.config import DATABASE_NAME
from backend.app.database import client

router = APIRouter()

@router.get("/")
def home():
    return {"message": "Employee Management System API is running!"}


@router.get("/db-check")
def check_database():
    client.admin.command("ping")

    return {
        "message": "MongoDB connection successful!",
        "database": DATABASE_NAME,
    }
