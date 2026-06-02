from django.contrib import admin
from .models import Order, OrderItem, CustomBouquetItem

admin.site.register([Order, OrderItem, CustomBouquetItem])
