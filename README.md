# Jersey Store - Deployment and Development Guide

## Stack
- Backend: Django + Django REST Framework + SimpleJWT
- Frontend: HTML, CSS, vanilla JavaScript
- Database: MySQL (production), SQLite (local fallback if configured)
- Hosting target: cPanel Python App (Cloud Babaal style shared Linux hosting)

## Local Development Setup
1. Open terminal and go to backend folder:
   - `cd C:\Users\user\Desktop\seren\jersey_store\backend`
2. Create virtual environment:
   - `python -m venv venv`
3. Install dependencies:
   - `venv\Scripts\python.exe -m pip install --upgrade pip`
   - `venv\Scripts\python.exe -m pip install -r requirements.txt`
4. Edit `backend/.env` for your local database values.
5. Run migrations:
   - `venv\Scripts\python.exe manage.py makemigrations`
   - `venv\Scripts\python.exe manage.py migrate`
6. Create admin user:
   - `venv\Scripts\python.exe manage.py createsuperuser`
7. Start backend:
   - `venv\Scripts\python.exe manage.py runserver`
8. Open:
   - `http://127.0.0.1:8000/admin/`

## cPanel MySQL Setup
1. In cPanel, create database `jerseynepal_store`.
2. Create user `jerseynepal_user` and assign full privileges.
3. Save DB password and keep host as `localhost`.

## Server Deployment via SSH
1. SSH to server:
   - `ssh cpaneluser@your-server-host`
2. Clone project:
   - `cd /home/cpaneluser`
   - `git clone <your-repo-url> jersey_store`
3. Enter backend:
   - `cd /home/cpaneluser/jersey_store/backend`
4. Create Python venv:
   - `python3.11 -m venv /home/cpaneluser/virtualenv/jersey_store/3.11`
5. Activate and install:
   - `source /home/cpaneluser/virtualenv/jersey_store/3.11/bin/activate`
   - `pip install -r requirements.txt`

## Configure Production Environment
Update `backend/.env` on server:
- `SECRET_KEY` to secure random key
- `DEBUG=False`
- `ALLOWED_HOSTS=jerseynepal.com,www.jerseynepal.com`
- DB credentials matching cPanel
- `CORS_ALLOWED_ORIGINS=https://jerseynepal.com,https://www.jerseynepal.com`

## Migrations and Static
1. `python manage.py migrate`
2. `python manage.py collectstatic --noinput`

## cPanel Python App Configuration
1. Open **Setup Python App** in cPanel.
2. Python version: `3.11`.
3. Application root: `/home/cpaneluser/jersey_store/backend`.
4. Startup file: `passenger_wsgi.py`.
5. Entry point: `application`.

## Frontend Hosting
1. Upload `frontend/` contents to your public web root.
2. Keep `.htaccess` in that frontend root.
3. Ensure SSL is enabled for your domain.

## First Admin and Role
1. Create superuser:
   - `python manage.py createsuperuser`
2. Login to admin panel.
3. Open `Profile` for that user and set role to `admin`.

## Update Deployment Script
Run after each pull:
- `cd /home/cpaneluser/jersey_store/backend`
- `bash deploy.sh`

## Production Checklist
- `/api/public/jerseys/` responds correctly.
- Admin login works with JWT endpoints.
- Staff creation works only for admin role.
- Order placement decrements stock and rejects oversell.
- `collectstatic` completed and static files load.
- Media uploads for jersey images work.
