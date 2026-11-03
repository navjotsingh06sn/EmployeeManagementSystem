import os
import smtplib
from urllib.parse import unquote

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pymongo import ASCENDING
from pymongo.errors import DuplicateKeyError

from backend.app.database import (
    DOCUMENT_SIGNATURES,
    MAX_DOCUMENT_SIZE,
    db,
    documents_bucket,
    employees,
    users,
)
from backend.app.schemas import (
    EmployeeCreate,
    EmployeeStatusUpdate,
    EmployeeUpdate,
    PasswordChangeRequest,
    PasswordSet,
)
from backend.app.ocr_service import extract_masked_aadhaar_text
from backend.app.security import (
    get_current_user,
    hash_password,
    password_hash,
    require_admin,
)
from backend.app.services import (
    admin_employee_documents,
    document_download,
    employee_account_status,
    employee_documents,
    invitation_error_detail,
    log_invitation_error,
    next_employee_number,
    public_employee,
    send_employee_invitation,
)

router = APIRouter()

@router.get("/employees")
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


@router.post("/employees", status_code=status.HTTP_201_CREATED)
def create_employee(
    employee: EmployeeCreate,
    _: dict = Depends(require_admin),
):
    data = employee.model_dump()
    data["email"] = str(data["email"]).lower()
    data["name"] = ""
    data["department"] = ""
    data["contact_number"] = ""
    data["address"] = ""
    data["is_active"] = True
    data["employee_number"] = next_employee_number()

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
        log_invitation_error(error)
        if employee_id is not None:
            employees.delete_one({"_id": employee_id})
            users.delete_one({"employee_id": str(employee_id)})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=invitation_error_detail(error),
        ) from error

    saved_employee = employees.find_one({"_id": employee_id})

    return public_employee(saved_employee, account_status="invited")


@router.post("/employees/{employee_id}/invite")
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
        log_invitation_error(error)
        if created_user_id is not None:
            users.delete_one({"_id": created_user_id})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=invitation_error_detail(error),
        ) from error

    return {"message": "Employee invitation sent successfully."}


@router.post("/employees/{employee_id}/approve")
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


@router.post("/employees/{employee_id}/decline")
def decline_employee_request(
    employee_id: str,
    _: dict = Depends(require_admin),
):
    if not ObjectId.is_valid(employee_id):
        raise HTTPException(status_code=400, detail="Invalid employee ID.")

    account = users.find_one(
        {"employee_id": employee_id, "role": "employee", "status": "pending"}
    )
    if account is None:
        raise HTTPException(status_code=404, detail="Pending request not found.")

    users.update_one(
        {"_id": account["_id"]},
        {"$set": {"status": "declined"}},
    )

    return {"message": "Employee registration declined."}


@router.post("/employees/{employee_id}/account")
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


@router.get("/employees/me")
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


@router.get("/employees/me/documents")
def get_my_documents(user: dict = Depends(get_current_user)):
    if user.get("role") != "employee" or not user.get("employee_id"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint is for employee accounts.",
        )
    return employee_documents(user["employee_id"])


@router.post("/employees/me/documents", status_code=status.HTTP_201_CREATED)
async def upload_my_document(
    request: Request,
    user: dict = Depends(get_current_user),
):
    if user.get("role") != "employee" or not user.get("employee_id"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint is for employee accounts.",
        )

    raw_filename = unquote(request.headers.get("x-file-name", ""))
    filename = raw_filename.replace("\\", "/").rsplit("/", 1)[-1].strip()
    extension = os.path.splitext(filename)[1].lower()
    if not filename or len(filename) > 180 or extension not in DOCUMENT_SIGNATURES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only JPG, JPEG, or PNG Aadhaar card images are accepted.",
        )

    chunks = []
    total_size = 0
    async for chunk in request.stream():
        total_size += len(chunk)
        if total_size > MAX_DOCUMENT_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Documents must be 10 MB or smaller.",
            )
        chunks.append(chunk)

    content = b"".join(chunks)
    if not content:
        raise HTTPException(status_code=400, detail="The selected file is empty.")

    content_type, signature_check = DOCUMENT_SIGNATURES[extension]
    if not signature_check(content):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="The file contents do not match the selected document type.",
        )

    if db["employee_documents.files"].find_one(
        {
            "metadata.employee_id": user["employee_id"],
            "metadata.document_type": "aadhaar",
        }
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An Aadhaar card is already uploaded. Delete it before uploading a replacement.",
        )

    masked_ocr_text = extract_masked_aadhaar_text(content)

    document_id = documents_bucket.upload_from_stream(
        filename,
        content,
        metadata={
            "employee_id": user["employee_id"],
            "uploaded_by": user["email"],
            "content_type": content_type,
            "document_type": "aadhaar",
            "ocr_text": masked_ocr_text,
        },
    )
    document = documents_bucket.open_download_stream(document_id)
    return public_document(document)


@router.get("/employees/me/documents/{document_id}")
def download_my_document(
    document_id: str,
    user: dict = Depends(get_current_user),
):
    if user.get("role") != "employee" or not user.get("employee_id"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint is for employee accounts.",
        )
    return document_download(document_id, user["employee_id"])


@router.delete("/employees/me/documents/{document_id}")
def delete_my_document(
    document_id: str,
    user: dict = Depends(get_current_user),
):
    if user.get("role") != "employee" or not user.get("employee_id"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint is for employee accounts.",
        )
    if not ObjectId.is_valid(document_id):
        raise HTTPException(status_code=400, detail="Invalid document ID.")

    document_oid = ObjectId(document_id)
    owned_document = db["employee_documents.files"].find_one(
        {
            "_id": document_oid,
            "metadata.employee_id": user["employee_id"],
        },
        {"_id": 1},
    )
    if owned_document is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    documents_bucket.delete(document_oid)
    return {"message": "Document deleted."}


@router.put("/employees/me")
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


@router.put("/employees/me/password")
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


@router.get("/employees/{employee_id}")
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


@router.get("/employees/{employee_id}/documents")
def get_employee_documents(
    employee_id: str,
    _: dict = Depends(require_admin),
):
    if not ObjectId.is_valid(employee_id):
        raise HTTPException(status_code=400, detail="Invalid employee ID.")
    if employees.find_one({"_id": ObjectId(employee_id)}, {"_id": 1}) is None:
        raise HTTPException(status_code=404, detail="Employee not found.")
    return admin_employee_documents(employee_id)


@router.get("/employees/{employee_id}/documents/{document_id}")
def download_employee_document(
    employee_id: str,
    document_id: str,
    _: dict = Depends(require_admin),
):
    if not ObjectId.is_valid(employee_id):
        raise HTTPException(status_code=400, detail="Invalid employee ID.")
    return document_download(document_id, employee_id)


@router.put("/employees/{employee_id}")
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


@router.patch("/employees/{employee_id}/status")
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


@router.delete("/employees/{employee_id}")
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
    document_ids = [
        document._id
        for document in documents_bucket.find(
            {"metadata.employee_id": employee_id}
        )
    ]
    for document_id in document_ids:
        documents_bucket.delete(document_id)

    return {"message": "Employee deleted successfully."}
