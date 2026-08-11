import sys
import os

sys.path.insert(0, 'home2/serennpc/jersey_store/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'jersey_store.settings')

from django.core.wsgi import get_wsgi_application
application = get_wsgi_application()