from django.conf import settings
from django.db import models
from django.utils.text import slugify
from django.utils import timezone
from django.core.validators import MinValueValidator, MaxValueValidator


class Label(models.Model):
    CATEGORY_CHOICES = (('kits', 'Kits'), ('crochet', 'Crochet'), ('clothing', 'Clothing'))
    name = models.CharField(max_length=120)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    is_predefined = models.BooleanField(default=False)

    class Meta:
        unique_together = ('name', 'category')
        ordering = ['category', 'name']


class Product(models.Model):
    CATEGORY_CHOICES = Label.CATEGORY_CHOICES
    name = models.CharField(max_length=180)
    slug = models.SlugField(max_length=220, unique=True, blank=True)
    description = models.TextField()
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    labels = models.ManyToManyField(Label, blank=True, related_name='products')
    is_active = models.BooleanField(default=True)
    is_hot_pick = models.BooleanField(default=False)
    is_offer = models.BooleanField(default=False)
    original_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    stock_last_changed = models.DateTimeField(default=timezone.now)
    allow_print = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)


class ProductImage(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='images')
    image = models.ImageField(upload_to='products/')
    is_primary = models.BooleanField(default=False)


class ProductSize(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='sizes')
    size = models.CharField(max_length=30)
    quantity = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ('product', 'size')

    @property
    def low_stock(self):
        return 0 < self.quantity <= 3

    @property
    def out_of_stock(self):
        return self.quantity == 0


class BouquetFlower(models.Model):
    name = models.CharField(max_length=120)
    image = models.ImageField(upload_to='flowers/')
    price_per_unit = models.DecimalField(max_digits=10, decimal_places=2)
    max_quantity_per_bouquet = models.PositiveIntegerField(default=20)
    is_active = models.BooleanField(default=True)


class BouquetWrapping(models.Model):
    name = models.CharField(max_length=120)
    image = models.ImageField(upload_to='wrappings/')
    price = models.DecimalField(max_digits=10, decimal_places=2)
    is_active = models.BooleanField(default=True)


class Review(models.Model):
    product    = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='reviews')
    customer   = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reviews'
    )
    order      = models.ForeignKey(
        'orders.Order',
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reviews'
    )
    rating     = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    body       = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('product', 'order')
        ordering = ['-created_at']


class ManualSale(models.Model):
    SALE_METHOD_CHOICES = [
        ('in_person', 'In Person'),
        ('phone', 'Phone'),
        ('social_media', 'Social Media'),
        ('other', 'Other'),
    ]
    product       = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='manual_sales')
    size          = models.CharField(max_length=30)
    quantity      = models.PositiveIntegerField(default=1)
    price_at_sale = models.DecimalField(max_digits=10, decimal_places=2)
    sale_method   = models.CharField(max_length=30, choices=SALE_METHOD_CHOICES)
    description   = models.TextField(blank=True)
    order_code    = models.CharField(max_length=100, blank=True)
    sold_by       = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                      null=True, related_name='manual_sales')
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
