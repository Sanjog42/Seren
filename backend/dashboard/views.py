from django.db.models import Count, F, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import IsAdmin
from orders.models import Order, OrderItem


@api_view(['GET'])
@permission_classes([IsAdmin])
def orders_analytics(request):
    now = timezone.now()
    month = int(request.query_params.get('month', now.month))
    year = int(request.query_params.get('year', now.year))

    completed = Order.objects.filter(status='completed', created_at__year=year, created_at__month=month)
    all_month = Order.objects.filter(created_at__year=year, created_at__month=month)
    items_completed = OrderItem.objects.filter(order__in=completed, is_custom_bouquet_item=False)

    total_revenue = completed.aggregate(total=Sum('total_amount')).get('total') or 0
    total_items_sold = items_completed.aggregate(total=Sum('quantity')).get('total') or 0

    top_item = items_completed.values('product_name').annotate(quantity_sold=Sum('quantity')).order_by('-quantity_sold').first()

    category_qty = {'kits': 0, 'crochet': 0, 'clothing': 0}
    category_rev = {'kits': 0, 'crochet': 0, 'clothing': 0}

    for row in items_completed.values('product__category').annotate(qty=Sum('quantity'), rev=Sum(F('quantity') * F('price_at_purchase'))):
        cat = row['product__category'] or 'kits'
        if cat in category_qty:
            category_qty[cat] = row['qty'] or 0
            category_rev[cat] = float(row['rev'] or 0)

    status_breakdown = {k: 0 for k in ['pending', 'confirmed', 'sent_for_delivery', 'completed', 'cancelled']}
    for row in all_month.values('status').annotate(count=Count('id')):
        status_breakdown[row['status']] = row['count']

    return Response({
        'completed_orders_count': completed.count(),
        'total_revenue': float(total_revenue),
        'total_items_sold': total_items_sold,
        'most_selling_product': {
            'name': top_item['product_name'] if top_item else None,
            'quantity_sold': top_item['quantity_sold'] if top_item else 0,
        },
        'category_quantity_breakdown': category_qty,
        'category_revenue_breakdown': category_rev,
        'order_status_breakdown': status_breakdown,
    })
