"""Database indexes, backward-compatible migrations, and admin setup."""

from pymongo import ASCENDING, DESCENDING

from backend.app.config import ADMIN_EMAIL, ADMIN_PASSWORD
from backend.app.database import client, counters, employees, users
from backend.app.security import hash_password
from backend.app.services import next_employee_number


def initialize_database() -> None:
    client.admin.command("ping")

    employees.create_index([("email", ASCENDING)], unique=True)
    employees.update_many(
        {"is_active": {"$exists": False}},
        {"$set": {"is_active": True}},
    )

    highest_numbered_employee = employees.find_one(
        {"employee_number": {"$type": "number"}},
        sort=[("employee_number", DESCENDING)],
    )
    highest_employee_number = (
        highest_numbered_employee["employee_number"]
        if highest_numbered_employee
        else 0
    )
    counters.update_one(
        {"_id": "employee_number"},
        {"$max": {"value": highest_employee_number}},
        upsert=True,
    )

    unnumbered_employees = employees.find(
        {"employee_number": {"$exists": False}},
        {"_id": 1},
    ).sort("_id", ASCENDING)
    for employee in unnumbered_employees:
        employees.update_one(
            {"_id": employee["_id"], "employee_number": {"$exists": False}},
            {"$set": {"employee_number": next_employee_number()}},
        )

    employees.create_index([("employee_number", ASCENDING)], unique=True)
    users.create_index([("email", ASCENDING)], unique=True)
    users.update_many(
        {"role": "admin", "employee_id": None},
        {"$unset": {"employee_id": ""}},
    )
    users.create_index([("employee_id", ASCENDING)], unique=True, sparse=True)

    if not users.find_one({"email": ADMIN_EMAIL}):
        users.insert_one(
            {
                "email": ADMIN_EMAIL,
                "hashed_password": hash_password(ADMIN_PASSWORD),
                "role": "admin",
                "status": "approved",
            }
        )

    print("MongoDB connected successfully!")
