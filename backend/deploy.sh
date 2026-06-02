#!/bin/bash
set -euo pipefail

APP_ROOT="/home/cpaneluser/jersey_store/backend"
VENV_PATH="/home/cpaneluser/virtualenv/jersey_store/3.11/bin/activate"
RESTART_FILE="/home/cpaneluser/tmp/restart.txt"

cd "$APP_ROOT"
source "$VENV_PATH"

pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput

if [ -f "$RESTART_FILE" ]; then
  touch "$RESTART_FILE"
fi

echo "Deployment completed successfully."
