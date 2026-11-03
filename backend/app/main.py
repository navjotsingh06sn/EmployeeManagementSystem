"""FastAPI application setup and router registration."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.database import client
from backend.app.routers import admin, auth, employees, system
from backend.app.startup import initialize_database


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    try:
        yield
    finally:
        client.close()


app = FastAPI(title="Employee Management System", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(system.router)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(employees.router)
