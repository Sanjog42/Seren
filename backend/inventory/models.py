from django.db import models
from django.utils.text import slugify
from django.utils import timezone

class Category(models.Model):
    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=150, unique=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

class Jersey(models.Model):
    name = models.CharField(max_length=180)
    slug = models.SlugField(max_length=220, unique=True, blank=True)
    description = models.TextField()
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name='jerseys')
    price = models.DecimalField(max_digits=10, decimal_places=2)
    discount_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    stock = models.IntegerField(default=0)
    sizes_available = models.JSONField(default=list)
    is_active = models.BooleanField(default=True)
    is_hot_pick = models.BooleanField(default=False)
    hot_pick_order = models.PositiveSmallIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def low_stock(self):
        return 0 < self.stock <= 5

    @property
    def out_of_stock(self):
        return self.stock == 0

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

class JerseyImage(models.Model):
    jersey = models.ForeignKey(Jersey, on_delete=models.CASCADE, related_name='images')
    image = models.ImageField(upload_to='jerseys/')
    is_primary = models.BooleanField(default=False)
    uploaded_at = models.DateTimeField(auto_now_add=True)

class Offer(models.Model):
    title = models.CharField(max_length=180)
    description = models.TextField()
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2)
    start_date = models.DateTimeField()
    end_date = models.DateTimeField()
    applicable_jerseys = models.ManyToManyField(Jersey, related_name='offers', blank=True)
    is_active = models.BooleanField(default=True)

    @property
    def is_currently_active(self):
        now = timezone.now()
        return self.is_active and self.start_date <= now <= self.end_date
