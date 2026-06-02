from django.contrib import admin
from .models import Category, Jersey, JerseyImage, Offer
admin.site.register([Category, Jersey, JerseyImage, Offer])
