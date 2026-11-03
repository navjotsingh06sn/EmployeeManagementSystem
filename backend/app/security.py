"""Password handling, access tokens, and request authorization."""

from datetime import datetime, timedelta, timezone

import jwt
from bson import ObjectId
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash
from backend.app.config import ACCESS_TOKEN_EXPIRE_MINUTES, SECRET_KEY
from backend.app.database import employees, users

password_hash = PasswordHash.recommended()
dummy_password_hash = password_hash.hash("not-a-real-user-password")
bearer_scheme = HTTPBearer(auto_error=False)

def hash_password(password: str) -> str:
    return password_hash.hash(password)


def unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired login. Please sign in again.",
        headers={"WWW-Authenticate": "Bearer"},
    )


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
        account_status = user.get("status", "approved")
        if account_status == "declined":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your registration request was declined. Contact the administrator for help.",
            )
        if account_status != "approved":
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
