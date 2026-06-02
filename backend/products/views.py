from datetime import timedelta

from django.db.models import Q, Sum
from django.db.models.deletion import ProtectedError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from accounts.permissions import IsAdmin, IsStaffOrAdmin
from .models import BouquetFlower, BouquetWrapping, Label, ManualSale, Product, ProductImage, ProductSize
from .serializers import (
    BouquetFlowerSerializer,
    BouquetWrappingSerializer,
    HotPickSerializer,
    LabelSerializer,
    ManualSaleCreateSerializer,
    ManualSaleSerializer,
    ProductDetailSerializer,
    ProductImageSerializer,
    ProductListSerializer,
    ProductWriteSerializer,
    StockProductSerializer,
)




class PublicProductsView(generics.ListAPIView):
    serializer_class = ProductListSerializer
    permission_classes = [AllowAny]

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        limit = request.query_params.get('limit')
        if limit:
            try:
                qs = qs[:int(limit)]
            except (ValueError, TypeError):
                pass
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    def get_queryset(self):
        qs = Product.objects.filter(is_active=True).prefetch_related('labels', 'images', 'sizes', 'reviews', 'manual_sales').order_by('-created_at')
        category = self.request.query_params.get('category')
        labels   = self.request.query_params.getlist('label')
        sizes    = self.request.query_params.getlist('size')
        search   = self.request.query_params.get('search', '').strip()
        if category:
            qs = qs.filter(category=category)
        for label in labels:
            qs = qs.filter(labels__name__iexact=label)
        if sizes:
            qs = qs.filter(sizes__size__in=sizes)
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(description__icontains=search))
        return qs.distinct()


class PublicProductDetailView(generics.RetrieveAPIView):
    serializer_class = ProductDetailSerializer
    permission_classes = [AllowAny]
    queryset = Product.objects.filter(is_active=True).prefetch_related('labels', 'images', 'sizes')


@api_view(['GET'])
@permission_classes([AllowAny])
def public_labels(request):
    category = request.query_params.get('category')
    qs = Label.objects.all()
    if category:
        qs = qs.filter(category=category)
    return Response(LabelSerializer(qs, many=True).data)


@api_view(['GET'])
@permission_classes([AllowAny])
def public_flowers(request):
    qs = BouquetFlower.objects.filter(is_active=True)
    return Response(BouquetFlowerSerializer(qs, many=True, context={'request': request}).data)


@api_view(['GET'])
@permission_classes([AllowAny])
def public_wrappings(request):
    qs = BouquetWrapping.objects.filter(is_active=True)
    return Response(BouquetWrappingSerializer(qs, many=True, context={'request': request}).data)


class StaffProductViewSet(viewsets.ModelViewSet):
    permission_classes = [IsStaffOrAdmin]
    queryset = Product.objects.prefetch_related('labels', 'images', 'sizes', 'reviews', 'manual_sales').order_by('-created_at')

    def get_serializer_class(self):
        if self.action in {'list'}:
            return ProductListSerializer
        if self.action in {'retrieve'}:
            return ProductDetailSerializer
        return ProductWriteSerializer

    def destroy(self, request, *args, **kwargs):
        product = self.get_object()
        try:
            product.delete()
        except ProtectedError:
            order_count = product.orderitem_set.values('order').distinct().count()
            sale_count  = product.manual_sales.count()
            parts = []
            if order_count:
                parts.append(f'{order_count} order{"s" if order_count != 1 else ""}')
            if sale_count:
                parts.append(f'{sale_count} manual sale{"s" if sale_count != 1 else ""}')
            reason = ' and '.join(parts) if parts else 'existing records'
            return Response(
                {'detail': f'Cannot delete — this product is linked to {reason}. Deactivate it instead.'},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path='images')
    def upload_images(self, request, pk=None):
        product = self.get_object()
        files = request.FILES.getlist('images')
        if not files:
            return Response({'detail': 'No image files provided.'}, status=400)
        created = []
        has_primary = product.images.filter(is_primary=True).exists()
        for idx, f in enumerate(files):
            created.append(ProductImage.objects.create(product=product, image=f, is_primary=(not has_primary and idx == 0)))
        return Response(ProductImageSerializer(created, many=True, context={'request': request}).data, status=201)

    @action(detail=True, methods=['delete'], url_path=r'images/(?P<img_id>[^/.]+)')
    def delete_image(self, request, pk=None, img_id=None):
        product = self.get_object()
        image = get_object_or_404(ProductImage, pk=img_id, product=product)
        image.delete()
        if not product.images.filter(is_primary=True).exists():
            fallback = product.images.first()
            if fallback:
                fallback.is_primary = True
                fallback.save(update_fields=['is_primary'])
        return Response(status=204)

    @action(detail=True, methods=['put'], url_path=r'images/(?P<img_id>[^/.]+)/set-primary')
    def set_primary(self, request, pk=None, img_id=None):
        product = self.get_object()
        image = get_object_or_404(ProductImage, pk=img_id, product=product)
        product.images.update(is_primary=False)
        image.is_primary = True
        image.save(update_fields=['is_primary'])
        return Response({'detail': 'Primary image updated.'})

    @action(detail=True, methods=['put'], url_path='toggle-hot-pick')
    def toggle_hot_pick(self, request, pk=None):
        product = self.get_object()
        if not product.is_hot_pick and Product.objects.filter(is_hot_pick=True).count() >= 5:
            return Response({'detail': 'Maximum 5 hot picks allowed. Remove one first.'}, status=400)
        product.is_hot_pick = not product.is_hot_pick
        product.save(update_fields=['is_hot_pick'])
        return Response({'id': product.id, 'is_hot_pick': product.is_hot_pick})

    @action(detail=True, methods=['put'], url_path='toggle-offer')
    def toggle_offer(self, request, pk=None):
        product = self.get_object()
        product.is_offer = not product.is_offer
        update_fields = ['is_offer']

        if product.is_offer:
            # Accept offer price and original price when marking as offer
            if 'price' in request.data:
                product.price = request.data['price']
                update_fields.append('price')
            if 'original_price' in request.data:
                product.original_price = request.data['original_price']
                update_fields.append('original_price')
        else:
            # Clear original price when removing offer
            product.original_price = None
            update_fields.append('original_price')

        product.save(update_fields=update_fields)
        return Response({
            'id': product.id,
            'is_offer': product.is_offer,
            'price': str(product.price),
            'original_price': str(product.original_price) if product.original_price else None,
        })

    @action(detail=False, methods=['get'], url_path='stock')
    def stock(self, request):
        qs = Product.objects.prefetch_related('sizes').order_by('name')
        rows = []
        for p in qs:
            total = p.sizes.aggregate(total=Sum('quantity')).get('total') or 0
            any_low = p.sizes.filter(quantity__gt=0, quantity__lte=3).exists()
            all_out = not p.sizes.filter(quantity__gt=0).exists()
            high = p.sizes.filter(quantity__gt=10).exists()
            rows.append((p, total, any_low, all_out, high))

        filter_key = request.query_params.get('filter')
        if filter_key == 'low':
            rows = [r for r in rows if r[2]]
        elif filter_key == 'high':
            rows = [r for r in rows if r[4]]
        elif filter_key == 'out':
            rows = [r for r in rows if r[3]]

        rows.sort(key=lambda x: x[1])
        data = StockProductSerializer([r[0] for r in rows], many=True).data
        return Response(data)


class LabelManageViewSet(viewsets.ModelViewSet):
    serializer_class = LabelSerializer
    queryset = Label.objects.all().order_by('category', 'name')
    permission_classes = [IsStaffOrAdmin]


class FlowerManageViewSet(viewsets.ModelViewSet):
    serializer_class = BouquetFlowerSerializer
    queryset = BouquetFlower.objects.all().order_by('name')
    permission_classes = [IsStaffOrAdmin]


class WrappingManageViewSet(viewsets.ModelViewSet):
    serializer_class = BouquetWrappingSerializer
    queryset = BouquetWrapping.objects.all().order_by('name')
    permission_classes = [IsStaffOrAdmin]


@api_view(['GET'])
@permission_classes([AllowAny])
def public_sizes(request):
    """Return distinct size names for a category (used by filter sidebar)."""
    category = request.query_params.get('category')
    qs = ProductSize.objects.filter(product__is_active=True)
    if category:
        qs = qs.filter(product__category=category)
    sizes = list(qs.values_list('size', flat=True).distinct())
    return Response(sizes)


@api_view(['GET'])
@permission_classes([AllowAny])
def public_hot_picks(request):
    qs = Product.objects.filter(is_hot_pick=True, is_active=True).prefetch_related('labels', 'images')
    return Response(HotPickSerializer(qs, many=True, context={'request': request}).data)


@api_view(['GET'])
@permission_classes([AllowAny])
def public_offers(request):
    qs = Product.objects.filter(is_offer=True, is_active=True).prefetch_related('labels', 'images')
    return Response(HotPickSerializer(qs, many=True, context={'request': request}).data)


@api_view(['GET'])
@permission_classes([IsAdmin])
def unused_stock(request):
    cutoff = timezone.now() - timedelta(days=30)
    qs = Product.objects.prefetch_related('sizes').filter(stock_last_changed__lt=cutoff)
    products = []
    for p in qs:
        total = p.sizes.aggregate(total=Sum('quantity')).get('total') or 0
        if total > 0:
            products.append(p)
    return Response(StockProductSerializer(products, many=True).data)


class ManualSaleView(generics.GenericAPIView):
    permission_classes = [IsStaffOrAdmin]

    def get(self, request):
        sales = ManualSale.objects.select_related('product', 'sold_by').all()[:100]
        return Response(ManualSaleSerializer(sales, many=True).data)

    def post(self, request):
        serializer = ManualSaleCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        sale = serializer.save()
        return Response(ManualSaleSerializer(sale).data, status=status.HTTP_201_CREATED)
