import jwt
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from jwt.exceptions import InvalidTokenError
from pymongo.errors import DuplicateKeyError

from backend.app.config import SECRET_KEY
from backend.app.database import employees, users
from backend.app.schemas import EmployeeRegistration, InviteAccept, LoginRequest
from backend.app.security import (
    create_access_token,
    dummy_password_hash,
    get_current_user,
    hash_password,
    password_hash,
)
from backend.app.services import next_employee_number

router = APIRouter()

@router.post("/auth/register", status_code=status.HTTP_201_CREATED)
def register_employee(request: EmployeeRegistration):
    data = {
        "name": request.name.strip(),
        "email": str(request.email).lower(),
        "department": request.department.strip(),
        "contact_number": request.contact_number.strip(),
        "address": request.address.strip(),
        "is_active": True,
        "employee_number": next_employee_number(),
    }

    employee_id = None

    try:
        result = employees.insert_one(data)
        employee_id = result.inserted_id

        users.insert_one(
            {
                "email": data["email"],
                "hashed_password": hash_password(request.password),
                "role": "employee",
                "status": "pending",
                "employee_id": str(employee_id),
            }
        )
    except DuplicateKeyError:
        if employee_id is not None:
            employees.delete_one({"_id": employee_id})

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    return {
        "message": (
            f"Registration submitted. Your employee ID is {data['employee_number']}. "
            "You can sign in after an administrator approves your account."
        ),
        "employee_number": data["employee_number"],
        "status": "pending",
    }


@router.post("/auth/accept-invite")
def accept_employee_invite(request: InviteAccept):
    try:
        payload = jwt.decode(
            request.token,
            SECRET_KEY,
            algorithms=["HS256"],
        )
    except InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invitation link is invalid or has expired. Ask the administrator to send another.",
        )

    user_id = payload.get("sub")
    if (
        payload.get("purpose") != "employee_invite"
        or not isinstance(user_id, str)
        or not ObjectId.is_valid(user_id)
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invitation link is invalid or has expired.",
        )

    user = users.find_one({"_id": ObjectId(user_id), "role": "employee"})
    if (
        user is None
        or user.get("status") != "invited"
        or payload.get("email") != user.get("email")
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invitation was already used or is no longer valid. Ask the administrator for a new invitation.",
        )

    employee_id = user.get("employee_id")
    if not employee_id or not ObjectId.is_valid(employee_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invitation is missing its employee record. Ask the administrator for help.",
        )

    profile = {
        "name": request.name.strip(),
        "department": request.department.strip(),
        "contact_number": request.contact_number.strip(),
        "address": request.address.strip(),
    }
    if (
        not profile["name"]
        or not profile["department"]
        or len(profile["contact_number"]) < 7
        or len(profile["address"]) < 3
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Enter a name, department, valid contact number, and address.",
        )

    employee_update = employees.update_one(
        {"_id": ObjectId(employee_id)},
        {
            "$set": {
                **profile,
            }
        },
    )
    if employee_update.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The employee record for this invitation was not found. Ask the administrator for help.",
        )

    result = users.update_one(
        {"_id": user["_id"], "status": "invited"},
        {
            "$set": {
                "hashed_password": hash_password(request.password),
                "status": "approved",
            }
        },
    )

    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invitation was already used. Sign in with your email and password.",
        )

    return {"message": "Your account is ready. Sign in with your email and new password."}


@router.post("/auth/login")
def login(request: LoginRequest):
    email = str(request.email).lower()
    user = users.find_one({"email": email})

    stored_hash = (
        user.get("hashed_password", dummy_password_hash)
        if user
        else dummy_password_hash
    )
    valid_password = password_hash.verify(request.password, stored_hash)

    if user is None or not valid_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email or password is incorrect.",
        )

    if user["role"] == "employee":
        if user.get("status") == "invited":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Set up your account using the invitation link sent to your email.",
            )
        account_status = user.get("status", "approved")
        if account_status == "declined":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your registration request was declined. Contact the administrator for help.",
            )
        if account_status != "approved":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your registration is pending administrator approval.",
            )

        employee_id = user.get("employee_id")

        if not employee_id or not ObjectId.is_valid(employee_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Your employee profile is not available. "
                    "Contact the administrator."
                ),
            )

        employee = employees.find_one(
            {"_id": ObjectId(employee_id)},
            {"is_active": 1},
        )

        if employee is None or employee.get("is_active", True) is False:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Your employee account is deactivated. "
                    "Contact the administrator."
                ),
            )

    return {
        "access_token": create_access_token(user),
        "token_type": "bearer",
        "role": user["role"],
        "email": user["email"],
    }


@router.get("/auth/me")
def get_my_account(user: dict = Depends(get_current_user)):
    return {
        "email": user["email"],
        "role": user["role"],
        "employee_id": user.get("employee_id"),
    }
