import sys
import os

# Replace <cpanel_username> with your actual cPanel username
sys.path.insert(0, '/home/<cpanel_username>/seren/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'jersey_store.settings')

from django.core.wsgi import get_wsgi_application
application = get_wsgi_application()
