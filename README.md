# PM Job Saver

Local-first MVP for saving LinkedIn job posts from Chrome, enriching them with AI, and reviewing them in a dashboard.

## Apps

- `backend/` FastAPI + SQLite API and background processing
- `dashboard/` React + Vite review UI
- `extension/` Chrome Manifest V3 extension

## Local Run

### Backend

1. Create a Python 3.11+ virtualenv
2. Install `backend/requirements.txt`
3. Add `backend/.env` with your Gemini API key
4. Run `uvicorn main:app --reload --app-dir backend`

### Dashboard

1. Install dependencies in `dashboard/`
2. Run `npm run dev`

### Extension

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Load unpacked extension from `extension/`
