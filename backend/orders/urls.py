from django.urls import path

from .views import (
    delivery_search, delivery_locations_list,
    StaffDeliveryLocationListCreateView, StaffDeliveryLocationDetailView, toggle_delivery_location,
    my_orders, place_order, customer_cancel_order, submit_review,
    StaffOrderDetailView, StaffOrderListView, update_order_status,
)

urlpatterns = [
    # Public delivery
    path('delivery/search/', delivery_search),
    path('delivery/locations/', delivery_locations_list),

    # Staff delivery management
    path('staff/delivery/', StaffDeliveryLocationListCreateView.as_view()),
    path('staff/delivery/<int:pk>/', StaffDeliveryLocationDetailView.as_view()),
    path('staff/delivery/<int:pk>/toggle/', toggle_delivery_location),

    # Orders
    path('orders/my/', my_orders),
    path('orders/', place_order),
    path('orders/my/<int:pk>/cancel/', customer_cancel_order),
    path('orders/my/<int:pk>/review/', submit_review),
    path('staff/orders/', StaffOrderListView.as_view()),
    path('staff/orders/<int:pk>/', StaffOrderDetailView.as_view()),
    path('staff/orders/<int:pk>/status/', update_order_status),
]
