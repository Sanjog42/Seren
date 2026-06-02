from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    JerseyViewSet,
    OfferViewSet,
    public_jerseys,
    public_jersey_detail,
    public_hot_picks,
    public_offers,
    public_categories,
)

router = DefaultRouter()
router.register('jerseys', JerseyViewSet, basename='jerseys')
router.register('offers', OfferViewSet, basename='offers')

urlpatterns = [
    path('', include(router.urls)),
    path('public/jerseys/', public_jerseys),
    path('public/jerseys/<int:pk>/', public_jersey_detail),
    path('public/hot-picks/', public_hot_picks),
    path('public/offers/', public_offers),
    path('public/categories/', public_categories),
]
