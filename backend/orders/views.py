from django.db.models import Q
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from accounts.permissions import IsCustomer, IsStaffOrAdmin
from .models import DeliveryLocation, Order
from .serializers import (
    DeliveryLocationSerializer,
    OrderCreateSerializer, OrderSerializer, OrderStatusUpdateSerializer, MyOrderSerializer,
)


# ── Delivery Location endpoints ───────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def delivery_search(request):
    q = request.GET.get('q', '').strip()
    if len(q) < 2:
        return Response([])
    locations = DeliveryLocation.objects.filter(
        Q(name__icontains=q) | Q(coverage__icontains=q),
        is_active=True
    ).order_by('charge', 'name')[:10]
    return Response(DeliveryLocationSerializer(locations, many=True).data)


@api_view(['GET'])
@permission_classes([AllowAny])
def delivery_locations_list(request):
    locations = DeliveryLocation.objects.filter(is_active=True)
    return Response(DeliveryLocationSerializer(locations, many=True).data)


class StaffDeliveryLocationListCreateView(generics.ListCreateAPIView):
    serializer_class = DeliveryLocationSerializer
    permission_classes = [IsStaffOrAdmin]
    queryset = DeliveryLocation.objects.all()


class StaffDeliveryLocationDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = DeliveryLocationSerializer
    permission_classes = [IsStaffOrAdmin]
    queryset = DeliveryLocation.objects.all()


@api_view(['PUT'])
@permission_classes([IsStaffOrAdmin])
def toggle_delivery_location(request, pk):
    location = get_object_or_404(DeliveryLocation, pk=pk)
    location.is_active = not location.is_active
    location.save(update_fields=['is_active'])
    return Response(DeliveryLocationSerializer(location).data)


# ── Order endpoints ───────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_orders(request):
    orders = (
        Order.objects
        .filter(customer=request.user)
        .prefetch_related('items')
        .order_by('-created_at')
    )
    return Response(MyOrderSerializer(orders, many=True).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsCustomer])
def place_order(request):
    if request.user.role == 'customer' and not request.user.is_verified:
        return Response({'detail': 'Please verify your email first.'}, status=403)
    serializer = OrderCreateSerializer(data=request.data, context={'request': request})
    serializer.is_valid(raise_exception=True)
    order = serializer.save()
    return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)


class StaffOrderListView(generics.ListAPIView):
    serializer_class = OrderSerializer
    permission_classes = [IsStaffOrAdmin]

    def get_queryset(self):
        qs = (Order.objects
              .prefetch_related('items', 'bouquet_items')
              .select_related('customer', 'delivery_location')
              .order_by('-created_at'))
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return qs


class StaffOrderDetailView(generics.RetrieveAPIView):
    serializer_class = OrderSerializer
    permission_classes = [IsStaffOrAdmin]
    queryset = Order.objects.prefetch_related('items', 'bouquet_items').select_related('customer', 'delivery_location')


@api_view(['PUT'])
@permission_classes([IsAuthenticated, IsStaffOrAdmin])
def update_order_status(request, pk):
    order = get_object_or_404(Order, pk=pk)
    serializer = OrderStatusUpdateSerializer(data=request.data, context={'order': order, 'request': request})
    serializer.is_valid(raise_exception=True)
    serializer.save()
    order.refresh_from_db()
    return Response(OrderSerializer(order).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def submit_review(request, pk):
    """Customer submits star ratings (+ optional text) for products in a completed order."""
    from products.models import Review, Product as ProductModel
    order = get_object_or_404(Order, pk=pk, customer=request.user)

    if order.status != 'completed':
        return Response({'detail': 'Only completed orders can be reviewed.'}, status=status.HTTP_400_BAD_REQUEST)

    reviews_data = request.data.get('reviews', [])
    if not reviews_data:
        return Response({'detail': 'Please provide at least one review.'}, status=status.HTTP_400_BAD_REQUEST)

    valid_product_ids = set(
        order.items.filter(is_custom_bouquet_item=False)
                   .exclude(product__isnull=True)
                   .values_list('product_id', flat=True)
    )

    created_count = 0
    submitted_reviews = []   # collect for email alert

    for r in reviews_data:
        product_id = r.get('product_id')
        rating     = r.get('rating')
        body       = (r.get('body') or '').strip()

        if product_id not in valid_product_ids:
            return Response({'detail': f'Product {product_id} is not part of this order.'}, status=400)
        if not isinstance(rating, int) or not (1 <= rating <= 5):
            return Response({'detail': 'Rating must be a whole number between 1 and 5.'}, status=400)

        try:
            product = ProductModel.objects.get(pk=product_id)
        except ProductModel.DoesNotExist:
            continue

        _, created = Review.objects.get_or_create(
            product=product,
            order=order,
            defaults={'customer': request.user, 'rating': rating, 'body': body},
        )
        if created:
            created_count += 1
            submitted_reviews.append({'product_name': product.name, 'rating': rating, 'body': body})

    if submitted_reviews:
        from .emails import send_review_alert
        send_review_alert(order, submitted_reviews)

    return Response({'detail': f'Thank you! {created_count} review(s) submitted.'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def customer_cancel_order(request, pk):
    """Customer can cancel their own order only while it is still pending."""
    order = get_object_or_404(Order, pk=pk, customer=request.user)
    if order.status != 'pending':
        return Response(
            {'detail': 'Only pending orders can be cancelled.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    reason = (request.data.get('reason') or '').strip()
    if not reason:
        return Response(
            {'detail': 'Please provide a reason for cancellation.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    order.status = 'cancelled'
    order.cancellation_reason = f'Cancelled by customer: {reason}'
    order.save(update_fields=['status', 'cancellation_reason'])
    return Response({'detail': 'Order cancelled successfully.'})
