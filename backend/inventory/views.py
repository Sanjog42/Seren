from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from accounts.permissions import IsStaffOrAdminRole
from .models import Category, Jersey, JerseyImage, Offer
from .serializers import CategorySerializer, JerseyImageSerializer, JerseySerializer, OfferSerializer


class JerseyViewSet(viewsets.ModelViewSet):
    serializer_class = JerseySerializer
    permission_classes = [IsStaffOrAdminRole]
    queryset = Jersey.objects.select_related('category').prefetch_related('images', 'offers').order_by('-created_at')

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get('search', '').strip()
        category = self.request.query_params.get('category', '').strip()
        low_stock = self.request.query_params.get('low_stock')
        out_of_stock = self.request.query_params.get('out_of_stock')

        if search:
            qs = qs.filter(name__icontains=search)
        if category:
            qs = qs.filter(category_id=category)
        if low_stock == 'true':
            qs = qs.filter(stock__gt=0, stock__lte=5)
        if out_of_stock == 'true':
            qs = qs.filter(stock=0)
        return qs

    @action(detail=False, methods=['post'], url_path='hot-picks')
    def set_hot_picks(self, request):
        jersey_ids = request.data.get('jersey_ids')
        if not isinstance(jersey_ids, list):
            return Response({'detail': 'jersey_ids must be a list.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(jersey_ids) > 5:
            return Response({'detail': 'You can select up to 5 hot picks.'}, status=status.HTTP_400_BAD_REQUEST)

        valid_ids = list(
            Jersey.objects.filter(id__in=jersey_ids, is_active=True).values_list('id', flat=True)
        )
        if len(valid_ids) != len(set(jersey_ids)):
            return Response({'detail': 'One or more jersey IDs are invalid.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            Jersey.objects.update(is_hot_pick=False, hot_pick_order=None)
            for idx, jersey_id in enumerate(jersey_ids, start=1):
                Jersey.objects.filter(id=jersey_id).update(is_hot_pick=True, hot_pick_order=idx)

        return Response({'detail': 'Hot picks updated successfully.'}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='images')
    def upload_images(self, request, pk=None):
        jersey = self.get_object()
        files = request.FILES.getlist('images') or request.FILES.getlist('image')
        if not files:
            return Response({'detail': 'No image files provided.'}, status=status.HTTP_400_BAD_REQUEST)

        created = []
        with transaction.atomic():
            has_primary = jersey.images.filter(is_primary=True).exists()
            for idx, file_obj in enumerate(files):
                image = JerseyImage.objects.create(
                    jersey=jersey,
                    image=file_obj,
                    is_primary=(not has_primary and idx == 0),
                )
                created.append(image)
        serializer = JerseyImageSerializer(created, many=True, context={'request': request})
        return Response({'images': serializer.data}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path=r'images/(?P<img_id>[^/.]+)')
    def delete_image(self, request, pk=None, img_id=None):
        jersey = self.get_object()
        image = get_object_or_404(JerseyImage, pk=img_id, jersey=jersey)
        image.delete()

        if not jersey.images.filter(is_primary=True).exists():
            fallback = jersey.images.order_by('uploaded_at').first()
            if fallback:
                fallback.is_primary = True
                fallback.save(update_fields=['is_primary'])

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['put'], url_path=r'images/(?P<img_id>[^/.]+)/set-primary')
    def set_primary(self, request, pk=None, img_id=None):
        jersey = self.get_object()
        image = get_object_or_404(JerseyImage, pk=img_id, jersey=jersey)
        JerseyImage.objects.filter(jersey=jersey, is_primary=True).update(is_primary=False)
        image.is_primary = True
        image.save(update_fields=['is_primary'])
        return Response({'detail': 'Primary image updated.'})


class OfferViewSet(viewsets.ModelViewSet):
    serializer_class = OfferSerializer
    permission_classes = [IsStaffOrAdminRole]
    queryset = Offer.objects.prefetch_related('applicable_jerseys').order_by('-id')


@api_view(['GET'])
@permission_classes([AllowAny])
def public_jerseys(request):
    queryset = Jersey.objects.filter(is_active=True).select_related('category').prefetch_related('images', 'offers').order_by('-created_at')
    return Response(JerseySerializer(queryset, many=True, context={'request': request}).data)


@api_view(['GET'])
@permission_classes([AllowAny])
def public_hot_picks(request):
    queryset = (
        Jersey.objects.filter(is_active=True, is_hot_pick=True)
        .select_related('category')
        .prefetch_related('images', 'offers')
        .order_by('hot_pick_order', '-created_at')[:5]
    )
    return Response(JerseySerializer(queryset, many=True, context={'request': request}).data)


@api_view(['GET'])
@permission_classes([AllowAny])
def public_jersey_detail(request, pk):
    jersey = get_object_or_404(
        Jersey.objects.filter(is_active=True).select_related('category').prefetch_related('images', 'offers'),
        pk=pk,
    )
    return Response(JerseySerializer(jersey, context={'request': request}).data)


@api_view(['GET'])
@permission_classes([AllowAny])
def public_offers(request):
    now = timezone.now()
    queryset = Offer.objects.filter(is_active=True, start_date__lte=now, end_date__gte=now).prefetch_related('applicable_jerseys')
    return Response(OfferSerializer(queryset, many=True).data)


@api_view(['GET'])
@permission_classes([AllowAny])
def public_categories(request):
    return Response(CategorySerializer(Category.objects.order_by('name'), many=True).data)
