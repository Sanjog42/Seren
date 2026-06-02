from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    FlowerManageViewSet,
    LabelManageViewSet,
    ManualSaleView,
    PublicProductDetailView,
    PublicProductsView,
    StaffProductViewSet,
    WrappingManageViewSet,
    public_flowers,
    public_hot_picks,
    public_labels,
    public_offers,
    public_sizes,
    public_wrappings,
    unused_stock,
)

router = DefaultRouter()
router.register(r'staff/products', StaffProductViewSet, basename='staff-products')
router.register(r'staff/labels', LabelManageViewSet, basename='staff-labels')
router.register(r'staff/bouquet/flowers', FlowerManageViewSet, basename='staff-flowers')
router.register(r'staff/bouquet/wrappings', WrappingManageViewSet, basename='staff-wrappings')

urlpatterns = [
    path('', include(router.urls)),
    path('products/', PublicProductsView.as_view()),
    path('products/<int:pk>/', PublicProductDetailView.as_view()),
    path('products/labels/', public_labels),
    path('products/sizes/', public_sizes),
    path('bouquet/flowers/', public_flowers),
    path('bouquet/wrappings/', public_wrappings),
    path('products/hot-picks/', public_hot_picks),
    path('products/offers/', public_offers),
    path('admin/unused-stock/', unused_stock),
    path('staff/manual-sales/', ManualSaleView.as_view()),
]
