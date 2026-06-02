from django.urls import path
from .views import orders_analytics

urlpatterns = [
    path('orders/', orders_analytics),
]
