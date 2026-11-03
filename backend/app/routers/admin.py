from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pymongo import ASCENDING

from backend.app.database import employees, users
from backend.app.schemas import PasswordChangeRequest
from backend.app.security import hash_password, password_hash, require_admin
from backend.app.services import public_employee

router = APIRouter()

@router.get("/admin/requests")
def get_pending_employee_requests(_: dict = Depends(require_admin)):
    requests = []

    for account in users.find({"role": "employee", "status": "pending"}).sort(
        "email", ASCENDING
    ):
        employee_id = account.get("employee_id")
        if not employee_id or not ObjectId.is_valid(employee_id):
            continue

        employee = employees.find_one({"_id": ObjectId(employee_id)})
        if employee is not None:
            requests.append(public_employee(employee, account_status="pending"))

    return requests


@router.put("/admin/me/password")
def change_admin_password(
    request: PasswordChangeRequest,
    admin: dict = Depends(require_admin),
):
    if not password_hash.verify(
        request.current_password,
        admin["hashed_password"],
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your current password is incorrect.",
        )

    if request.current_password == request.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose a new password different from your current one.",
        )

    users.update_one(
        {"_id": admin["_id"]},
        {"$set": {"hashed_password": hash_password(request.new_password)}},
    )

    return {"message": "Admin password changed successfully."}
