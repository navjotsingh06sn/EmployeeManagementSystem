from pydantic import BaseModel, EmailStr, Field


class EmployeeCreate(BaseModel):
    email: EmailStr


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


class AdminProfileUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    department: str = Field(min_length=1, max_length=100)
    contact_number: str = Field(min_length=7, max_length=25)
    address: str = Field(min_length=3, max_length=250)


class PasswordSet(BaseModel):
    password: str = Field(min_length=8, max_length=128)


class InviteAccept(BaseModel):
    token: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=100)
    department: str = Field(min_length=1, max_length=100)
    contact_number: str = Field(min_length=7, max_length=25)
    address: str = Field(min_length=3, max_length=250)
    password: str = Field(min_length=8, max_length=128)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class EmployeeStatusUpdate(BaseModel):
    is_active: bool


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
