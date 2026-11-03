import os
import smtplib
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

import jwt
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError
from pydantic import BaseModel, EmailStr, Field
from pwdlib import PasswordHash
from pymongo import ASCENDING, MongoClient
from pymongo.errors import DuplicateKeyError

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL")
DATABASE_NAME = os.getenv("DATABASE_NAME", "employee_db")
SECRET_KEY = os.getenv("SECRET_KEY")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "").strip().lower()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60")
)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
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

client = MongoClient(MONGODB_URL, serverSelectionTimeoutMS=5000)
db = client[DATABASE_NAME]
employees = db["employees"]
users = db["users"]

password_hash = PasswordHash.recommended()
dummy_password_hash = password_hash.hash("not-a-real-user-password")
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def send_employee_invitation(employee: dict, user: dict) -> None:
    if not all((SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM_EMAIL)):
        raise RuntimeError("Email delivery is not configured.")

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
        f"Hi {employee['name']},\n\n"
        "An administrator added you to PeopleDesk. Use the link below within "
        "24 hours to set your password and activate your account. Your email "
        "address will be your username.\n\n"
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
        "name": employee["name"],
        "email": str(employee["email"]),
        "department": employee["department"],
        "contact_number": employee.get("contact_number", ""),
        "address": employee.get("address", ""),
        "is_active": employee.get("is_active", True),
        "has_account": account_status != "no_account",
        "account_status": account_status,
    }


def unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired login. Please sign in again.",
        headers={"WWW-Authenticate": "Bearer"},
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    client.admin.command("ping")

    employees.create_index([("email", ASCENDING)], unique=True)

    # Older employee records without a status remain active.
    employees.update_many(
        {"is_active": {"$exists": False}},
        {"$set": {"is_active": True}},
    )

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
    yield
    client.close()


app = FastAPI(title="Employee Management System", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class EmployeeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    department: str = Field(min_length=1, max_length=100)
    contact_number: str = Field(min_length=7, max_length=25)
    address: str = Field(min_length=3, max_length=250)


class EmployeeRegistration(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    department: str = Field(min_length=1, max_length=100)
    contact_number: str = Field(min_length=7, max_length=25)
    address: str = Field(min_length=3, max_length=250)
    password: str = Field(min_length=8, max_length=128)


class EmployeeUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    department: str = Field(min_length=1, max_length=100)
    contact_number: str = Field(min_length=7, max_length=25)
    address: str = Field(min_length=3, max_length=250)


class PasswordSet(BaseModel):
    password: str = Field(min_length=8, max_length=128)


class InviteAccept(BaseModel):
    token: str = Field(min_length=1)
    password: str = Field(min_length=8, max_length=128)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class EmployeeStatusUpdate(BaseModel):
    is_active: bool


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


def create_access_token(user: dict) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    return jwt.encode(
        {
            "sub": str(user["_id"]),
            "role": user["role"],
            "exp": expires_at,
        },
        SECRET_KEY,
        algorithm="HS256",
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    if credentials is None:
        raise unauthorized()

    try:
        payload = jwt.decode(
            credentials.credentials,
            SECRET_KEY,
            algorithms=["HS256"],
        )
        user_id = payload.get("sub")

        if not user_id or not ObjectId.is_valid(user_id):
            raise unauthorized()
    except InvalidTokenError:
        raise unauthorized()

    user = users.find_one({"_id": ObjectId(user_id)})

    if user is None:
        raise unauthorized()

    if user.get("role") == "employee":
        if user.get("status", "approved") != "approved":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account is waiting for administrator approval.",
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

    return user


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access is required.",
        )

    return user


def employee_account_status(employee_id: str) -> str:
    account = users.find_one({"employee_id": employee_id}, {"status": 1})

    if account is None:
        return "no_account"

    return account.get("status", "approved")


@app.get("/")
def home():
    return {"message": "Employee Management System API is running!"}


@app.get("/db-check")
def check_database():
    client.admin.command("ping")

    return {
        "message": "MongoDB connection successful!",
        "database": DATABASE_NAME,
    }


@app.post("/auth/register", status_code=status.HTTP_201_CREATED)
def register_employee(request: EmployeeRegistration):
    data = {
        "name": request.name.strip(),
        "email": str(request.email).lower(),
        "department": request.department.strip(),
        "contact_number": request.contact_number.strip(),
        "address": request.address.strip(),
        "is_active": True,
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
            "Registration submitted. You can sign in after an administrator "
            "approves your account."
        ),
        "status": "pending",
    }


@app.post("/auth/accept-invite")
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


@app.post("/auth/login")
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
        if user.get("status", "approved") != "approved":
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


@app.get("/auth/me")
def get_my_account(user: dict = Depends(get_current_user)):
    return {
        "email": user["email"],
        "role": user["role"],
        "employee_id": user.get("employee_id"),
    }


@app.get("/employees")
def get_all_employees(_: dict = Depends(require_admin)):
    results = []

    for employee in employees.find().sort("name", ASCENDING):
        results.append(
            public_employee(
                employee,
                account_status=employee_account_status(str(employee["_id"])),
            )
        )

    return results


@app.post("/employees", status_code=status.HTTP_201_CREATED)
def create_employee(
    employee: EmployeeCreate,
    _: dict = Depends(require_admin),
):
    data = employee.model_dump()
    data["email"] = str(data["email"]).lower()
    data["name"] = data["name"].strip()
    data["department"] = data["department"].strip()
    data["is_active"] = True

    employee_id = None

    try:
        result = employees.insert_one(data)
        employee_id = result.inserted_id

        user_result = users.insert_one(
            {
                "email": data["email"],
                "role": "employee",
                "status": "invited",
                "employee_id": str(employee_id),
            }
        )
        user = users.find_one({"_id": user_result.inserted_id})
        send_employee_invitation(data, user)
    except DuplicateKeyError:
        if employee_id is not None:
            employees.delete_one({"_id": employee_id})

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )
    except (OSError, smtplib.SMTPException, RuntimeError) as error:
        if employee_id is not None:
            employees.delete_one({"_id": employee_id})
            users.delete_one({"employee_id": str(employee_id)})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Could not send the employee invitation. Check the email settings "
                "and try again."
            ),
        ) from error

    saved_employee = employees.find_one({"_id": employee_id})

    return public_employee(saved_employee, account_status="invited")


@app.post("/employees/{employee_id}/invite")
def invite_employee(
    employee_id: str,
    _: dict = Depends(require_admin),
):
    if not ObjectId.is_valid(employee_id):
        raise HTTPException(status_code=400, detail="Invalid employee ID.")

    employee = employees.find_one({"_id": ObjectId(employee_id)})
    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found.")

    linked_user = users.find_one({"employee_id": employee_id, "role": "employee"})
    created_user_id = None

    if linked_user and linked_user.get("status") != "invited":
        raise HTTPException(
            status_code=409,
            detail="This employee already has an active or pending account.",
        )

    try:
        if linked_user is None:
            result = users.insert_one(
                {
                    "email": str(employee["email"]).lower(),
                    "role": "employee",
                    "status": "invited",
                    "employee_id": employee_id,
                }
            )
            created_user_id = result.inserted_id
            linked_user = users.find_one({"_id": created_user_id})

        send_employee_invitation(employee, linked_user)
    except DuplicateKeyError as error:
        raise HTTPException(
            status_code=409,
            detail="A login account already uses this email.",
        ) from error
    except (OSError, smtplib.SMTPException, RuntimeError) as error:
        if created_user_id is not None:
            users.delete_one({"_id": created_user_id})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not send the employee invitation. Check the email settings and try again.",
        ) from error

    return {"message": "Employee invitation sent successfully."}


@app.post("/employees/{employee_id}/approve")
def approve_employee(
    employee_id: str,
    _: dict = Depends(require_admin),
):
    if not ObjectId.is_valid(employee_id):
        raise HTTPException(status_code=400, detail="Invalid employee ID.")

    employee = employees.find_one({"_id": ObjectId(employee_id)})

    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found.")

    account = users.find_one({"employee_id": employee_id, "role": "employee"})

    if account is None:
        raise HTTPException(
            status_code=404,
            detail="This employee does not have a self-registration account.",
        )

    users.update_one(
        {"_id": account["_id"]},
        {"$set": {"status": "approved"}},
    )

    return {"message": "Employee registration approved."}


@app.post("/employees/{employee_id}/account")
def set_employee_account(
    employee_id: str,
    request: PasswordSet,
    _: dict = Depends(require_admin),
):
    if not ObjectId.is_valid(employee_id):
        raise HTTPException(status_code=400, detail="Invalid employee ID.")

    employee = employees.find_one({"_id": ObjectId(employee_id)})

    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found.")

    linked_user = users.find_one({"employee_id": employee_id})

    if linked_user:
        users.update_one(
            {"_id": linked_user["_id"]},
            {
                "$set": {
                    "email": str(employee["email"]).lower(),
                    "hashed_password": hash_password(request.password),
                    "status": "approved",
                }
            },
        )
    else:
        try:
            users.insert_one(
                {
                    "email": str(employee["email"]).lower(),
                    "hashed_password": hash_password(request.password),
                    "role": "employee",
                    "status": "approved",
                    "employee_id": employee_id,
                }
            )
        except DuplicateKeyError:
            raise HTTPException(
                status_code=409,
                detail="A login account already uses this email.",
            )

    return {"message": "Employee login account is ready."}


@app.get("/employees/me")
def get_my_employee_record(user: dict = Depends(get_current_user)):
    if user.get("role") != "employee" or not user.get("employee_id"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint is for employee accounts.",
        )

    employee = employees.find_one({"_id": ObjectId(user["employee_id"])})

    if employee is None:
        raise HTTPException(status_code=404, detail="Employee record not found.")

    return public_employee(employee, account_status="approved")


@app.put("/employees/me")
def update_my_employee_record(
    request: EmployeeUpdate,
    user: dict = Depends(get_current_user),
):
    if user.get("role") != "employee" or not user.get("employee_id"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint is for employee accounts.",
        )

    employee_id = user["employee_id"]
    employee_object_id = ObjectId(employee_id)

    employee = employees.find_one({"_id": employee_object_id})

    if employee is None:
        raise HTTPException(status_code=404, detail="Employee record not found.")

    data = request.model_dump()
    data["name"] = data["name"].strip()
    data["department"] = data["department"].strip()
    data["email"] = str(data["email"]).lower()

    email_in_use = employees.find_one(
        {
            "email": data["email"],
            "_id": {"$ne": employee_object_id},
        }
    )

    account_in_use = users.find_one(
        {
            "email": data["email"],
            "_id": {"$ne": user["_id"]},
        }
    )

    if email_in_use or account_in_use:
        raise HTTPException(
            status_code=409,
            detail="Another employee account already uses this email.",
        )

    users.update_one(
        {"_id": user["_id"]},
        {"$set": {"email": data["email"]}},
    )

    employees.update_one(
        {"_id": employee_object_id},
        {"$set": data},
    )

    updated = employees.find_one({"_id": employee_object_id})

    return public_employee(updated, account_status="approved")


@app.put("/admin/me/password")
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


@app.put("/employees/me/password")
def change_my_password(
    request: PasswordChangeRequest,
    user: dict = Depends(get_current_user),
):
    if user.get("role") != "employee":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint is for employee accounts.",
        )

    if not password_hash.verify(
        request.current_password,
        user["hashed_password"],
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
        {"_id": user["_id"]},
        {"$set": {"hashed_password": hash_password(request.new_password)}},
    )

    return {"message": "Password changed successfully."}


@app.get("/employees/{employee_id}")
def get_employee(
    employee_id: str,
    _: dict = Depends(require_admin),
):
    if not ObjectId.is_valid(employee_id):
        raise HTTPException(status_code=400, detail="Invalid employee ID.")

    employee = employees.find_one({"_id": ObjectId(employee_id)})

    if employee is None:
        raise HTTPException(status_code=404, detail="Employee not found.")

    return public_employee(
        employee,
        account_status=employee_account_status(employee_id),
    )


@app.put("/employees/{employee_id}")
def update_employee(
    employee_id: str,
    employee: EmployeeUpdate,
    _: dict = Depends(require_admin),
):
    if not ObjectId.is_valid(employee_id):
        raise HTTPException(status_code=400, detail="Invalid employee ID.")

    employee_object_id = ObjectId(employee_id)
    existing_employee = employees.find_one({"_id": employee_object_id})

    if existing_employee is None:
        raise HTTPException(status_code=404, detail="Employee not found.")

    data = employee.model_dump()
    data["name"] = data["name"].strip()
    data["department"] = data["department"].strip()
    data["email"] = str(data["email"]).lower()

    email_in_use = employees.find_one(
        {
            "email": data["email"],
            "_id": {"$ne": employee_object_id},
        }
    )

    linked_user = users.find_one({"employee_id": employee_id})
    account_filter = {"email": data["email"]}

    if linked_user:
        account_filter["_id"] = {"$ne": linked_user["_id"]}

    account_in_use = users.find_one(account_filter)

    if email_in_use or account_in_use:
        raise HTTPException(
            status_code=409,
            detail="Another employee account already uses this email.",
        )

    if linked_user:
        users.update_one(
            {"_id": linked_user["_id"]},
            {"$set": {"email": data["email"]}},
        )

    employees.update_one(
        {"_id": employee_object_id},
        {"$set": data},
    )

    updated_employee = employees.find_one({"_id": employee_object_id})

    return public_employee(
        updated_employee,
        account_status=employee_account_status(employee_id),
    )


@app.patch("/employees/{employee_id}/status")
def update_employee_status(
    employee_id: str,
    request: EmployeeStatusUpdate,
    _: dict = Depends(require_admin),
):
    if not ObjectId.is_valid(employee_id):
        raise HTTPException(status_code=400, detail="Invalid employee ID.")

    employee_object_id = ObjectId(employee_id)

    result = employees.update_one(
        {"_id": employee_object_id},
        {"$set": {"is_active": request.is_active}},
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Employee not found.")

    employee = employees.find_one({"_id": employee_object_id})

    return {
        "message": (
            "Employee activated successfully."
            if request.is_active
            else "Employee deactivated successfully."
        ),
        "employee": public_employee(
            employee,
            account_status=employee_account_status(employee_id),
        ),
    }


@app.delete("/employees/{employee_id}")
def delete_employee(
    employee_id: str,
    _: dict = Depends(require_admin),
):
    if not ObjectId.is_valid(employee_id):
        raise HTTPException(status_code=400, detail="Invalid employee ID.")

    result = employees.delete_one({"_id": ObjectId(employee_id)})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Employee not found.")

    users.delete_many({"employee_id": employee_id})

    return {"message": "Employee deleted successfully."}
