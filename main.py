"""Compatibility entry point for the existing uvicorn main:app command."""
from backend.app.main import app
__all__=["app"]
