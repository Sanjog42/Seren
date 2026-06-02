from django.contrib import admin
from .models import Label, Product, ProductImage, ProductSize, BouquetFlower, BouquetWrapping

admin.site.register([Label, Product, ProductImage, ProductSize, BouquetFlower, BouquetWrapping])
