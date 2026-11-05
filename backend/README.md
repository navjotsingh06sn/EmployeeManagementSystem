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

Install Python dependencies from the project root with `pip install -r requirements.txt`.

Run the API from either directory:

- Project root: `uvicorn main:app --reload`
- `backend/`: `uvicorn main:app --reload`

The root `main.py` and `backend/main.py` are entry-point wrappers for the same app. Render uses the project root, with `uvicorn main:app --host 0.0.0.0 --port $PORT` as its start command; see the root `render.yaml` for the backend service configuration. That Blueprint installs Tesseract and prompts for the MongoDB URL and administrator credentials.

Set `MONGODB_URL`, `SECRET_KEY` (at least 32 characters), `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in the project `.env` for local use. OCR requires the Tesseract executable in addition to Python packages. On Windows, install Tesseract OCR; the app searches PATH and the standard Program Files locations automatically. If installed elsewhere, set `TESSERACT_CMD` in `.env` to the full path of `tesseract.exe`, then restart the backend. Render installs Tesseract during its build. Deploy the frontend as a Static Site from the same repository with build command `cd frontend && npm ci && npm run build`, publish directory `frontend/dist`, and `VITE_API_URL` set to the backend's public URL. Set the backend's `FRONTEND_URL` to the Static Site's public URL so browser requests and invitation links use the correct address.
