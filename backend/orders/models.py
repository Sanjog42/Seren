from django.db import models
from django.conf import settings

from products.models import BouquetFlower, BouquetWrapping, Product


class DeliveryLocation(models.Model):
    name = models.CharField(max_length=200)
    coverage = models.CharField(max_length=500, blank=True, default='')
    district = models.CharField(max_length=100, blank=True, default='')
    charge = models.IntegerField()
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['district', 'name']

    def __str__(self):
        return f"{self.name} — Rs.{self.charge}"


class Order(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('confirmed', 'Confirmed'),
        ('sent_for_delivery', 'Sent For Delivery'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    )
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='orders')
    customer_phone = models.CharField(max_length=30)
    created_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='pending')
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    delivery_notes = models.TextField(blank=True)
    delivery_location = models.ForeignKey(
        'DeliveryLocation', null=True, blank=True, on_delete=models.SET_NULL
    )
    delivery_charge = models.IntegerField(default=0)
    is_custom_bouquet = models.BooleanField(default=False)
    order_code = models.CharField(max_length=100, blank=True)
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='confirmed_orders'
    )
    dispatched_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='dispatched_orders'
    )
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='completed_orders'
    )
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='cancelled_orders'
    )
    cancellation_reason = models.TextField(blank=True, default='')


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.PROTECT, null=True, blank=True)
    product_name = models.CharField(max_length=220)
    size = models.CharField(max_length=30)
    quantity = models.PositiveIntegerField()
    price_at_purchase = models.DecimalField(max_digits=10, decimal_places=2)
    is_custom_bouquet_item = models.BooleanField(default=False)
    print_name = models.CharField(max_length=15, blank=True, default='')
    print_number = models.IntegerField(null=True, blank=True)


class CustomBouquetItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='bouquet_items')
    flower = models.ForeignKey(BouquetFlower, on_delete=models.PROTECT)
    flower_name = models.CharField(max_length=120)
    quantity = models.PositiveIntegerField()
    price_per_unit = models.DecimalField(max_digits=10, decimal_places=2)
    wrapping = models.ForeignKey(BouquetWrapping, on_delete=models.PROTECT)
    wrapping_name = models.CharField(max_length=120)
    wrapping_price = models.DecimalField(max_digits=10, decimal_places=2)
