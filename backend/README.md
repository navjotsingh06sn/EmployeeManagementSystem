# Backend structure

- `app/main.py`: FastAPI app, middleware, and router wiring.
- `app/config.py`: environment settings and validation.
- `app/database.py`: MongoDB client, collections, and document settings.
- `app/schemas.py`: request validation models.
- `app/security.py`: password hashing, login tokens, and access checks.
- `app/services.py`: shared invitation, employee, and document logic.
- `app/ocr_service.py`: local Aadhaar OCR and number masking.
- `app/startup.py`: database indexes, migrations, and admin initialization.
- `app/routers/`: API routes grouped into auth, admin, employee, and system modules.

The project-root `main.py` remains the entry point for `uvicorn main:app --reload`.
Install Python dependencies with `pip install -r requirements.txt`. Aadhaar OCR also requires the Tesseract executable; set `TESSERACT_CMD` in the project `.env` if it is not on the system PATH.
