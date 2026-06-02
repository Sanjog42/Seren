# Seren — Football Jerseys & Kits Store

A full-stack e-commerce web app for selling football jerseys and kits in Nepal.

## Stack
- **Backend:** Django 5 + Django REST Framework + SimpleJWT
- **Frontend:** Plain HTML, CSS, Vanilla JavaScript (no framework)
- **Database:** SQLite (local dev) / MySQL (production cPanel)
- **Hosting:** cPanel Python App (LiteSpeed + Passenger WSGI)

---

## Local Development Setup

### 1. Clone the repo
```bash
git clone https://github.com/Sanjog42/Seren.git
cd Seren
```

### 2. Set up the backend
```bash
cd backend
python -m venv venv
```

Activate the virtual environment:
- **Windows:** `venv\Scripts\activate`
- **Mac/Linux:** `source venv/bin/activate`

```bash
pip install -r requirements.txt
```

### 3. Configure environment
```bash
cp .env.example .env
```
Edit `.env` — the defaults in `.env.example` work for local SQLite dev out of the box. Just add a `SECRET_KEY`.

Generate a secret key:
```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

### 4. Run migrations and create admin
```bash
python manage.py migrate
python manage.py createsuperuser
```

Then go to `http://127.0.0.1:8000/admin/`, open the user you just created, and set **role = admin**.

### 5. Start the backend
```bash
python manage.py runserver
```
API is now running at `http://127.0.0.1:8000`

### 6. Set up the frontend
The frontend is static HTML/JS. Open `frontend/` in VS Code and use the **Live Server** extension (right-click `index.html` → Open with Live Server). It will run at `http://127.0.0.1:5500`.

**Important:** Before opening, set the API URL to point to your local backend.
Open `frontend/js/api.js` and change line 1 from:
```js
export const BASE_URL = window.__API_BASE_URL__ || 'http://serennp.com';
```
to:
```js
export const BASE_URL = window.__API_BASE_URL__ || 'http://127.0.0.1:8000';
```

> Remember to revert this before deploying to production.

---

## Production Deployment (cPanel)

### 1. Upload files
- Upload `backend/` contents to your app root (e.g. `/home/cpaneluser/jersey_store/backend`)
- Upload `frontend/` contents to `public_html/`

### 2. Set up Python App in cPanel
- Python version: `3.11`
- Application root: `/home/cpaneluser/jersey_store/backend`
- Startup file: `passenger_wsgi.py`
- Entry point: `application`

### 3. Create and activate virtualenv, install dependencies
```bash
source /home/cpaneluser/virtualenv/jersey_store/backend/3.11/bin/activate
pip install -r requirements.txt
```

### 4. Configure production `.env`
Copy `.env.example` to `.env` and fill in:
- `SECRET_KEY` — long random string
- `DEBUG=False`
- `ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com`
- MySQL DB credentials (from cPanel → MySQL Databases)
- `CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com`
- cPanel email SMTP settings

### 5. Run migrations and collect static
```bash
python manage.py migrate
python manage.py collectstatic --noinput
```

### 6. Restart the Python App
In cPanel → Setup Python App → Restart.

### 7. Set the frontend API URL back to production
In `frontend/js/api.js` line 1, ensure it points to your live domain:
```js
export const BASE_URL = window.__API_BASE_URL__ || 'https://yourdomain.com';
```

---

## After each code update (server)
```bash
bash deploy.sh
```
This runs `collectstatic` and touches `tmp/restart.txt` to restart Passenger.

---

## First Admin Setup
1. SSH into server or use cPanel terminal
2. `python manage.py createsuperuser`
3. Log into `/admin/`, open the user, set **role = admin**
4. Now you can create staff accounts from the admin dashboard

---

## Key URLs
| URL | Description |
|-----|-------------|
| `/` | Homepage |
| `/shop` | All products |
| `/login` | Customer login |
| `/dashboard/admin` | Admin dashboard |
| `/dashboard/staff` | Staff dashboard |
| `/api/` | Django REST API root |
| `/admin/` | Django admin panel |
