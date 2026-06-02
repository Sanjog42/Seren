from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from products.models import BouquetFlower, BouquetWrapping, Product, ProductSize
from .emails import send_new_order_alert, send_order_invoice
from .models import CustomBouquetItem, DeliveryLocation, Order, OrderItem


class DeliveryLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeliveryLocation
        fields = ['id', 'name', 'coverage', 'district', 'charge', 'is_active']


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ['id', 'product', 'product_name', 'size', 'quantity', 'price_at_purchase', 'is_custom_bouquet_item', 'print_name', 'print_number']


class CustomBouquetItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomBouquetItem
        fields = ['id', 'flower', 'flower_name', 'quantity', 'price_per_unit', 'wrapping', 'wrapping_name', 'wrapping_price']


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    bouquet_items = CustomBouquetItemSerializer(many=True, read_only=True)
    customer_name              = serializers.SerializerMethodField()
    customer_email             = serializers.SerializerMethodField()
    confirmed_by_name          = serializers.SerializerMethodField()
    dispatched_by_name         = serializers.SerializerMethodField()
    completed_by_name          = serializers.SerializerMethodField()
    cancelled_by_name          = serializers.SerializerMethodField()
    delivery_location_name     = serializers.SerializerMethodField()
    delivery_location_district = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            'id', 'customer', 'customer_name', 'customer_email', 'customer_phone',
            'created_at', 'status', 'total_amount',
            'delivery_location', 'delivery_location_name', 'delivery_location_district',
            'delivery_charge', 'delivery_notes', 'is_custom_bouquet',
            'order_code', 'confirmed_by_name', 'dispatched_by_name',
            'completed_by_name', 'cancelled_by_name', 'cancellation_reason',
            'items', 'bouquet_items',
        ]

    def get_customer_name(self, obj):
        return obj.customer.get_full_name().strip() or obj.customer.email

    def get_customer_email(self, obj):
        return obj.customer.email

    def get_confirmed_by_name(self, obj):
        return obj.confirmed_by.get_full_name().strip() or obj.confirmed_by.email if obj.confirmed_by else None

    def get_dispatched_by_name(self, obj):
        return obj.dispatched_by.get_full_name().strip() or obj.dispatched_by.email if obj.dispatched_by else None

    def get_completed_by_name(self, obj):
        return obj.completed_by.get_full_name().strip() or obj.completed_by.email if obj.completed_by else None

    def get_cancelled_by_name(self, obj):
        return obj.cancelled_by.get_full_name().strip() or obj.cancelled_by.email if obj.cancelled_by else None

    def get_delivery_location_name(self, obj):
        return obj.delivery_location.name if obj.delivery_location else None

    def get_delivery_location_district(self, obj):
        return obj.delivery_location.district if obj.delivery_location else None


class MyOrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model  = OrderItem
        fields = ['product', 'product_name', 'size', 'quantity', 'price_at_purchase', 'is_custom_bouquet_item', 'print_name', 'print_number']


class MyOrderSerializer(serializers.ModelSerializer):
    items        = MyOrderItemSerializer(many=True, read_only=True)
    has_reviewed = serializers.SerializerMethodField()

    class Meta:
        model  = Order
        fields = ['id', 'status', 'created_at', 'total_amount', 'delivery_charge', 'cancellation_reason', 'has_reviewed', 'items']

    def get_has_reviewed(self, obj):
        if obj.status != 'completed':
            return False
        from products.models import Review
        return Review.objects.filter(order=obj).exists()


class OrderCreateItemInputSerializer(serializers.Serializer):
    product = serializers.IntegerField(required=False)
    product_name = serializers.CharField(required=False)
    size = serializers.CharField(max_length=30)
    quantity = serializers.IntegerField(min_value=1)
    price = serializers.DecimalField(max_digits=10, decimal_places=2)
    is_custom_bouquet_item = serializers.BooleanField(default=False)
    print_name = serializers.CharField(required=False, allow_blank=True, default='', max_length=15)
    print_number = serializers.IntegerField(required=False, allow_null=True, min_value=0, max_value=99, default=None)

    def validate_print_name(self, value):
        if value and not all(c.isalpha() or c == ' ' for c in value):
            raise serializers.ValidationError('Print name may only contain letters and spaces.')
        return value


class OrderCreateSerializer(serializers.Serializer):
    customer_phone       = serializers.CharField(max_length=30)
    delivery_location_id = serializers.IntegerField()
    delivery_notes       = serializers.CharField(required=False, allow_blank=True, default='')
    items                = OrderCreateItemInputSerializer(many=True)

    def validate_delivery_location_id(self, value):
        try:
            loc = DeliveryLocation.objects.get(pk=value, is_active=True)
        except DeliveryLocation.DoesNotExist:
            raise serializers.ValidationError('Invalid or inactive delivery location.')
        return value

    def validate(self, attrs):
        if not attrs.get('items'):
            raise serializers.ValidationError({'items': 'At least one item is required.'})
        return attrs

    def create(self, validated_data):
        user = self.context['request'].user
        items_data = validated_data['items']
        total = Decimal('0')

        location = DeliveryLocation.objects.get(pk=validated_data['delivery_location_id'])

        with transaction.atomic():
            order = Order.objects.create(
                customer=user,
                customer_phone=validated_data['customer_phone'],
                delivery_notes=validated_data.get('delivery_notes', ''),
                delivery_location=location,
                delivery_charge=location.charge,
                status='pending',
            )

            for row in items_data:
                if row.get('is_custom_bouquet_item'):
                    order.is_custom_bouquet = True
                    OrderItem.objects.create(
                        order=order,
                        product=None,
                        product_name=row.get('product_name', 'Custom Bouquet'),
                        size=row['size'],
                        quantity=row['quantity'],
                        price_at_purchase=row['price'],
                        is_custom_bouquet_item=True,
                    )
                    total += row['price'] * row['quantity']
                    continue

                product = Product.objects.select_for_update().get(pk=row['product'])
                size_obj = ProductSize.objects.select_for_update().filter(product=product, size=row['size']).first()
                if not size_obj:
                    raise serializers.ValidationError({'detail': f'Size {row["size"]} not available for {product.name}.'})
                if size_obj.quantity < row['quantity']:
                    raise serializers.ValidationError({'detail': f'Insufficient stock for {product.name} ({size_obj.size}).'})

                OrderItem.objects.create(
                    order=order,
                    product=product,
                    product_name=product.name,
                    size=size_obj.size,
                    quantity=row['quantity'],
                    price_at_purchase=row['price'],
                    is_custom_bouquet_item=False,
                    print_name=row.get('print_name', ''),
                    print_number=row.get('print_number', None),
                )
                total += row['price'] * row['quantity']

            order.total_amount = total
            order.save(update_fields=['total_amount', 'is_custom_bouquet'])

        send_order_invoice(order)
        send_new_order_alert(order)
        return order


class OrderStatusUpdateSerializer(serializers.Serializer):
    status              = serializers.ChoiceField(choices=['pending', 'confirmed', 'sent_for_delivery', 'completed', 'cancelled'])
    order_code          = serializers.CharField(required=False, allow_blank=True, default='')
    cancellation_reason = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, attrs):
        order = self.context['order']
        new_status = attrs['status']
        allowed = {
            'pending':           {'confirmed', 'cancelled'},
            'confirmed':         {'sent_for_delivery', 'cancelled', 'pending'},       # + revert to pending
            'sent_for_delivery': {'completed', 'cancelled', 'confirmed'},             # + revert to confirmed
            'completed':         {'sent_for_delivery'},                               # + revert to sent_for_delivery
            'cancelled':         set(),
        }
        if new_status not in allowed[order.status]:
            raise serializers.ValidationError({'detail': f'Invalid transition from {order.status} to {new_status}.'})
        # order_code only required on the forward dispatch transition
        if order.status == 'confirmed' and new_status == 'sent_for_delivery' and not attrs.get('order_code', '').strip():
            raise serializers.ValidationError({'order_code': 'Order code is required before sending for delivery.'})
        if new_status == 'cancelled' and not attrs.get('cancellation_reason', '').strip():
            raise serializers.ValidationError({'cancellation_reason': 'A cancellation reason is required.'})
        return attrs

    def save(self, **kwargs):
        order      = self.context['order']
        request    = self.context.get('request')
        new_status = self.validated_data['status']
        staff      = request.user if request else None

        update_fields = ['status']

        with transaction.atomic():
            # ── Forward transitions ───────────────────────────────────────────
            if order.status == 'pending' and new_status == 'confirmed':
                for item in order.items.filter(is_custom_bouquet_item=False):
                    size = ProductSize.objects.select_for_update().get(product=item.product, size=item.size)
                    if size.quantity < item.quantity:
                        raise serializers.ValidationError({'detail': f'Not enough stock to confirm {item.product_name} ({item.size}).'})
                    size.quantity -= item.quantity
                    size.save(update_fields=['quantity'])
                order.confirmed_by = staff
                update_fields.append('confirmed_by')

            elif order.status == 'confirmed' and new_status == 'sent_for_delivery':
                order.dispatched_by = staff
                order.order_code    = self.validated_data.get('order_code', '').strip()
                update_fields += ['dispatched_by', 'order_code']

            elif order.status == 'sent_for_delivery' and new_status == 'completed':
                order.completed_by = staff
                update_fields.append('completed_by')

            elif new_status == 'cancelled':
                order.cancelled_by = staff
                order.cancellation_reason = self.validated_data.get('cancellation_reason', '').strip()
                update_fields += ['cancelled_by', 'cancellation_reason']
                # Restore stock if it was already deducted (confirmed or in delivery)
                if order.status in ('confirmed', 'sent_for_delivery'):
                    for item in order.items.filter(is_custom_bouquet_item=False):
                        try:
                            size = ProductSize.objects.select_for_update().get(
                                product=item.product, size=item.size
                            )
                            size.quantity += item.quantity
                            size.save(update_fields=['quantity'])
                        except ProductSize.DoesNotExist:
                            pass  # product/size was deleted; skip silently

            # ── Revert transitions ────────────────────────────────────────────
            elif order.status == 'confirmed' and new_status == 'pending':
                # Restore stock that was deducted on confirmation
                for item in order.items.filter(is_custom_bouquet_item=False):
                    try:
                        size = ProductSize.objects.select_for_update().get(
                            product=item.product, size=item.size
                        )
                        size.quantity += item.quantity
                        size.save(update_fields=['quantity'])
                    except ProductSize.DoesNotExist:
                        pass
                order.confirmed_by = None
                update_fields.append('confirmed_by')

            elif order.status == 'sent_for_delivery' and new_status == 'confirmed':
                # Clear dispatch info (stock stays deducted — still confirmed)
                order.dispatched_by = None
                order.order_code    = ''
                update_fields += ['dispatched_by', 'order_code']

            elif order.status == 'completed' and new_status == 'sent_for_delivery':
                # Clear completion record
                order.completed_by = None
                update_fields.append('completed_by')

            order.status = new_status
            order.save(update_fields=update_fields)
        return order
