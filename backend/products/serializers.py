from django.db import transaction
from django.db.models import Sum
from rest_framework import serializers

from django.db.models import Avg, Sum

from .models import BouquetFlower, BouquetWrapping, Label, ManualSale, Product, ProductImage, ProductSize, Review


class LabelSerializer(serializers.ModelSerializer):
    class Meta:
        model = Label
        fields = ['id', 'name', 'category', 'is_predefined']


class ProductImageSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = ProductImage
        fields = ['id', 'image', 'is_primary']

    def get_image(self, obj):
        req = self.context.get('request')
        if not obj.image:
            return ''
        return req.build_absolute_uri(obj.image.url) if req else obj.image.url


class ProductSizeSerializer(serializers.ModelSerializer):
    low_stock = serializers.BooleanField(read_only=True)
    out_of_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = ProductSize
        fields = ['id', 'size', 'quantity', 'low_stock', 'out_of_stock']


class ProductListSerializer(serializers.ModelSerializer):
    primary_image = serializers.SerializerMethodField()
    all_images    = serializers.SerializerMethodField()
    labels        = serializers.SerializerMethodField()
    low_stock     = serializers.SerializerMethodField()
    out_of_stock  = serializers.SerializerMethodField()
    sold_count    = serializers.SerializerMethodField()
    avg_rating    = serializers.SerializerMethodField()
    review_count  = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'slug', 'category', 'price', 'original_price',
            'primary_image', 'all_images', 'labels',
            'low_stock', 'out_of_stock', 'is_hot_pick', 'is_offer', 'is_active', 'allow_print',
            'sold_count', 'avg_rating', 'review_count',
        ]

    def get_primary_image(self, obj):
        primary = obj.images.filter(is_primary=True).first() or obj.images.first()
        if not primary:
            return ''
        req = self.context.get('request')
        return req.build_absolute_uri(primary.image.url) if req else primary.image.url

    def get_all_images(self, obj):
        req = self.context.get('request')
        urls = []
        for img in obj.images.all():
            if img.image:
                urls.append(req.build_absolute_uri(img.image.url) if req else img.image.url)
        return urls

    def get_labels(self, obj):
        return list(obj.labels.values_list('name', flat=True))

    def get_low_stock(self, obj):
        return obj.sizes.filter(quantity__gt=0, quantity__lte=3).exists()

    def get_out_of_stock(self, obj):
        return not obj.sizes.filter(quantity__gt=0).exists()

    def get_sold_count(self, obj):
        # Use prefetched manual_sales if available, else fall back to query
        from orders.models import OrderItem
        order_qty = OrderItem.objects.filter(
            product=obj, order__status='completed', is_custom_bouquet_item=False
        ).aggregate(total=Sum('quantity')).get('total') or 0
        manual_qty = obj.manual_sales.aggregate(total=Sum('quantity')).get('total') or 0
        return order_qty + manual_qty

    def get_avg_rating(self, obj):
        # Use prefetched reviews to avoid extra query
        reviews = obj.reviews.all()
        ratings = [r.rating for r in reviews]
        if not ratings:
            return None
        return round(sum(ratings) / len(ratings), 1)

    def get_review_count(self, obj):
        return len(obj.reviews.all())


class ReviewSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()

    class Meta:
        model  = Review
        fields = ['id', 'rating', 'body', 'customer_name', 'created_at']

    def get_customer_name(self, obj):
        if obj.customer:
            name = obj.customer.get_full_name().strip()
            return name or obj.customer.email.split('@')[0]
        return 'Anonymous'


class ProductDetailSerializer(serializers.ModelSerializer):
    labels       = LabelSerializer(many=True, read_only=True)
    images       = ProductImageSerializer(many=True, read_only=True)
    sizes        = ProductSizeSerializer(many=True, read_only=True)
    reviews      = ReviewSerializer(many=True, read_only=True)
    sold_count   = serializers.SerializerMethodField()
    avg_rating   = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'slug', 'description', 'category', 'price', 'original_price',
            'labels', 'images', 'sizes', 'is_active', 'is_offer', 'allow_print',
            'created_at', 'updated_at', 'sold_count', 'avg_rating', 'review_count', 'reviews',
        ]

    def get_sold_count(self, obj):
        from orders.models import OrderItem
        order_qty = OrderItem.objects.filter(
            product=obj, order__status='completed', is_custom_bouquet_item=False
        ).aggregate(total=Sum('quantity')).get('total') or 0
        manual_qty = obj.manual_sales.aggregate(total=Sum('quantity')).get('total') or 0
        return order_qty + manual_qty

    def get_avg_rating(self, obj):
        result = obj.reviews.aggregate(avg=Avg('rating')).get('avg')
        return round(float(result), 1) if result else None

    def get_review_count(self, obj):
        return obj.reviews.count()


class ProductWriteSerializer(serializers.ModelSerializer):
    labels = serializers.PrimaryKeyRelatedField(queryset=Label.objects.all(), many=True, required=False)
    sizes = ProductSizeSerializer(many=True, required=True)

    class Meta:
        model = Product
        fields = ['id', 'name', 'description', 'category', 'price', 'original_price', 'labels', 'sizes', 'is_active', 'is_offer', 'allow_print']

    def validate(self, attrs):
        # allow_print is only meaningful for kits; force it off for all other categories
        if attrs.get('category', getattr(self.instance, 'category', None)) != 'kits':
            attrs['allow_print'] = False
        return attrs

    def create(self, validated_data):
        sizes = validated_data.pop('sizes', [])
        labels = validated_data.pop('labels', [])
        product = Product.objects.create(**validated_data)
        if labels:
            product.labels.set(labels)
        for row in sizes:
            ProductSize.objects.create(product=product, **row)
        return product

    def update(self, instance, validated_data):
        sizes = validated_data.pop('sizes', None)
        labels = validated_data.pop('labels', None)
        for k, v in validated_data.items():
            setattr(instance, k, v)
        instance.save()
        if labels is not None:
            instance.labels.set(labels)
        if sizes is not None:
            instance.sizes.all().delete()
            for row in sizes:
                ProductSize.objects.create(product=instance, **row)
        return instance


class BouquetFlowerSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = BouquetFlower
        fields = ['id', 'name', 'image', 'price_per_unit', 'max_quantity_per_bouquet', 'is_active']

    def get_image(self, obj):
        req = self.context.get('request')
        return req.build_absolute_uri(obj.image.url) if req and obj.image else (obj.image.url if obj.image else '')


class BouquetWrappingSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = BouquetWrapping
        fields = ['id', 'name', 'image', 'price', 'is_active']

    def get_image(self, obj):
        req = self.context.get('request')
        return req.build_absolute_uri(obj.image.url) if req and obj.image else (obj.image.url if obj.image else '')


class HotPickSerializer(serializers.ModelSerializer):
    primary_image = serializers.SerializerMethodField()
    labels = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = ['id', 'name', 'slug', 'category', 'price', 'original_price', 'primary_image', 'labels', 'is_offer']

    def get_primary_image(self, obj):
        primary = obj.images.filter(is_primary=True).first() or obj.images.first()
        if not primary:
            return ''
        req = self.context.get('request')
        return req.build_absolute_uri(primary.image.url) if req else primary.image.url

    def get_labels(self, obj):
        return list(obj.labels.values_list('name', flat=True))


class StockProductSerializer(serializers.ModelSerializer):
    sizes = ProductSizeSerializer(many=True, read_only=True)
    total_stock = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = ['id', 'name', 'category', 'sizes', 'total_stock', 'stock_last_changed']

    def get_total_stock(self, obj):
        return obj.sizes.aggregate(total=Sum('quantity')).get('total') or 0


# ── Manual / in-person sales ───────────────────────────────────────────────────

class ManualSaleCreateSerializer(serializers.Serializer):
    product_id  = serializers.IntegerField()
    size        = serializers.CharField()
    quantity    = serializers.IntegerField(min_value=1)
    sale_method = serializers.ChoiceField(choices=ManualSale.SALE_METHOD_CHOICES)
    description = serializers.CharField(required=False, allow_blank=True, default='')
    order_code  = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, attrs):
        try:
            product = Product.objects.get(id=attrs['product_id'])
        except Product.DoesNotExist:
            raise serializers.ValidationError({'product_id': 'Product not found.'})
        try:
            size_obj = ProductSize.objects.get(product=product, size=attrs['size'])
        except ProductSize.DoesNotExist:
            raise serializers.ValidationError({'size': 'Size not found for this product.'})
        if size_obj.quantity < attrs['quantity']:
            raise serializers.ValidationError(
                {'quantity': f'Only {size_obj.quantity} in stock for {attrs["size"]}.'}
            )
        attrs['_product']  = product
        attrs['_size_obj'] = size_obj
        return attrs

    def create(self, validated_data):
        product  = validated_data.pop('_product')
        size_obj = validated_data.pop('_size_obj')
        validated_data.pop('product_id')

        with transaction.atomic():
            size_obj = ProductSize.objects.select_for_update().get(pk=size_obj.pk)
            if size_obj.quantity < validated_data['quantity']:
                raise serializers.ValidationError({'quantity': 'Insufficient stock.'})
            size_obj.quantity -= validated_data['quantity']
            size_obj.save(update_fields=['quantity'])

            sale = ManualSale.objects.create(
                product       = product,
                size          = validated_data['size'],
                quantity      = validated_data['quantity'],
                price_at_sale = product.price,
                sale_method   = validated_data['sale_method'],
                description   = validated_data['description'],
                order_code    = validated_data.get('order_code', ''),
                sold_by       = self.context['request'].user,
            )
        return sale


class ManualSaleSerializer(serializers.ModelSerializer):
    product_name       = serializers.CharField(source='product.name', read_only=True)
    sold_by_name       = serializers.SerializerMethodField()
    sale_method_label  = serializers.CharField(source='get_sale_method_display', read_only=True)

    class Meta:
        model  = ManualSale
        fields = [
            'id', 'product_name', 'size', 'quantity', 'price_at_sale',
            'sale_method', 'sale_method_label', 'description', 'order_code',
            'sold_by_name', 'created_at',
        ]

    def get_sold_by_name(self, obj):
        return obj.sold_by.get_full_name().strip() or obj.sold_by.email if obj.sold_by else '—'
