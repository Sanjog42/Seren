from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from .models import Category, Jersey, JerseyImage, Offer


class JerseyImageSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = JerseyImage
        fields = ['id', 'image', 'is_primary', 'uploaded_at']

    def get_image(self, obj):
        request = self.context.get('request')
        if not obj.image:
            return ''
        if request is None:
            return obj.image.url
        return request.build_absolute_uri(obj.image.url)


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'slug']


class JerseySerializer(serializers.ModelSerializer):
    images = JerseyImageSerializer(many=True, read_only=True)
    low_stock = serializers.BooleanField(read_only=True)
    out_of_stock = serializers.BooleanField(read_only=True)
    effective_price = serializers.SerializerMethodField()
    active_offer_percent = serializers.SerializerMethodField()
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = Jersey
        fields = [
            'id', 'name', 'slug', 'description', 'category', 'category_name', 'price', 'discount_price',
            'stock', 'sizes_available', 'is_active', 'is_hot_pick', 'hot_pick_order',
            'created_at', 'updated_at', 'low_stock', 'out_of_stock', 'effective_price',
            'active_offer_percent', 'images'
        ]

    def _best_offer_percent(self, obj):
        now = timezone.now()
        offer = obj.offers.filter(is_active=True, start_date__lte=now, end_date__gte=now).order_by('-discount_percent').first()
        return offer.discount_percent if offer else Decimal('0')

    def get_active_offer_percent(self, obj):
        return self._best_offer_percent(obj)

    def get_effective_price(self, obj):
        base = obj.discount_price if obj.discount_price is not None else obj.price
        pct = self._best_offer_percent(obj)
        effective = base - ((base * pct) / Decimal('100'))
        return effective.quantize(Decimal('0.01'))


class OfferSerializer(serializers.ModelSerializer):
    is_currently_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = Offer
        fields = '__all__'
