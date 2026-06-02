import random
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView

from .emails import send_password_reset_email, send_verification_email, send_welcome_email
from .models import CustomUser, EmailVerification, PasswordResetOTP
from .permissions import IsAdmin, IsCustomer
from .serializers import (
    CreateStaffSerializer,
    CustomTokenObtainPairSerializer,
    RegisterSerializer,
    ResendOtpSerializer,
    UserListSerializer,
    UserUpdateSerializer,
    VerifyEmailSerializer,
)


class LoginRateThrottle(AnonRateThrottle):
    rate = '10/minute'

class LoginView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
    authentication_classes = []
    permission_classes = []
    throttle_classes = [LoginRateThrottle]


@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user, code = serializer.save()
    try:
        send_verification_email(user, code)
    except Exception:
        user.delete()
        return Response({'detail': 'Failed to send verification email. Please try again.'}, status=500)
    return Response({'message': 'Verification code sent to your email.'}, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_email(request):
    serializer = VerifyEmailSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data['email'].strip().lower()
    code = serializer.validated_data['code'].strip()

    user = get_object_or_404(CustomUser, email=email)
    verification = get_object_or_404(EmailVerification, user=user)

    if verification.is_used:
        return Response({'detail': 'Verification code already used.'}, status=400)
    if verification.is_expired:
        return Response({'detail': 'Code expired, please request a new one'}, status=400)
    if verification.code != code:
        return Response({'detail': 'Invalid verification code.'}, status=400)

    user.is_verified = True
    user.save(update_fields=['is_verified'])
    verification.is_used = True
    verification.save(update_fields=['is_used'])
    send_welcome_email(user)

    token_serializer = CustomTokenObtainPairSerializer()
    refresh = token_serializer.get_token(user)
    return Response({
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'role': user.role,
        'is_verified': user.is_verified,
        'name': user.get_full_name().strip() or user.email,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def resend_otp(request):
    serializer = ResendOtpSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data['email'].strip().lower()
    user = get_object_or_404(CustomUser, email=email)

    if user.role != 'customer':
        return Response({'detail': 'Only customers use OTP verification.'}, status=400)
    if user.is_verified:
        return Response({'detail': 'User already verified.'}, status=400)

    verification, _ = EmailVerification.objects.get_or_create(
        user=user,
        defaults={
            'code': str(random.randint(100000, 999999)),
            'expires_at': timezone.now() + timedelta(minutes=10),
        },
    )
    new_code = str(random.randint(100000, 999999))
    verification.code = new_code
    verification.created_at = timezone.now()
    verification.expires_at = timezone.now() + timedelta(minutes=10)
    verification.is_used = False
    verification.save(update_fields=['code', 'created_at', 'expires_at', 'is_used'])
    send_verification_email(user, new_code)
    return Response({'message': 'New verification code sent.'})


class UsersView(generics.ListAPIView):
    queryset = CustomUser.objects.filter(is_active=True).order_by('-date_joined')
    serializer_class = UserListSerializer
    permission_classes = [IsAdmin]


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = CustomUser.objects.all()
    serializer_class = UserUpdateSerializer
    permission_classes = [IsAdmin]

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()
        user.is_active = False
        user.save(update_fields=['is_active'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class CreateStaffView(generics.CreateAPIView):
    serializer_class = CreateStaffSerializer
    permission_classes = [IsAdmin]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserListSerializer(user).data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def me(request):
    """GET: return current user profile. PATCH: update name, email, or password."""
    user = request.user
    if request.method == 'GET':
        return Response({
            'email': user.email,
            'name': user.get_full_name().strip() or user.email,
            'username': user.username or '',
            'role': user.role,
        })

    # PATCH
    from rest_framework_simplejwt.tokens import RefreshToken
    data = request.data
    errors = {}

    if 'name' in data:
        full_name = (data['name'] or '').strip()
        if not full_name:
            errors['name'] = 'Name cannot be empty.'
        else:
            first, last = (full_name.split(' ', 1) + [''])[:2]
            user.first_name = first
            user.last_name = last

    if 'email' in data:
        new_email = (data['email'] or '').strip().lower()
        if not new_email:
            errors['email'] = 'Email cannot be empty.'
        elif CustomUser.objects.exclude(pk=user.pk).filter(email=new_email).exists():
            errors['email'] = 'This email is already in use.'
        else:
            user.email = new_email

    if 'username' in data:
        new_username = (data['username'] or '').strip()
        if not new_username:
            errors['username'] = 'Username cannot be empty.'
        elif CustomUser.objects.exclude(pk=user.pk).filter(username__iexact=new_username).exists():
            errors['username'] = 'This username is already taken.'
        elif not new_username.replace('_', '').replace('.', '').isalnum():
            errors['username'] = 'Username may only contain letters, numbers, underscores, and dots.'
        else:
            user.username = new_username

    if 'password' in data:
        new_pass = data['password']
        if len(new_pass) < 8:
            errors['password'] = 'Password must be at least 8 characters.'
        else:
            current = data.get('current_password', '')
            if not user.check_password(current):
                errors['current_password'] = 'Current password is incorrect.'
            else:
                user.set_password(new_pass)

    if errors:
        return Response(errors, status=400)

    user.save()

    # Issue fresh tokens so updated email/username are reflected immediately
    refresh = RefreshToken.for_user(user)
    refresh['role'] = user.role
    refresh['is_verified'] = user.is_verified
    refresh['name'] = user.get_full_name().strip() or user.email

    return Response({
        'email': user.email,
        'name': user.get_full_name().strip() or user.email,
        'username': user.username or '',
        'role': user.role,
        'access': str(refresh.access_token),
        'refresh': str(refresh),
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def forgot_password(request):
    """Send a password-reset OTP to the given email if an account exists."""
    email = (request.data.get('email') or '').strip().lower()
    if not email:
        return Response({'detail': 'Email is required.'}, status=400)

    try:
        user = CustomUser.objects.get(email=email, is_active=True)
    except CustomUser.DoesNotExist:
        # Return success anyway — don't leak whether the email is registered
        return Response({'detail': 'If an account with that email exists, a reset code has been sent.'})

    code = str(random.randint(100000, 999999))
    otp, _ = PasswordResetOTP.objects.get_or_create(
        user=user,
        defaults={
            'code': code,
            'expires_at': timezone.now() + timedelta(minutes=10),
        },
    )
    otp.refresh(code)

    try:
        send_password_reset_email(user, code)
    except Exception:
        return Response({'detail': 'Failed to send reset email. Please try again.'}, status=500)

    return Response({'detail': 'If an account with that email exists, a reset code has been sent.'})


@api_view(['POST'])
@permission_classes([AllowAny])
def reset_password(request):
    """Verify OTP and set a new password."""
    email    = (request.data.get('email') or '').strip().lower()
    code     = (request.data.get('code') or '').strip()
    password = (request.data.get('password') or '').strip()

    if not email or not code or not password:
        return Response({'detail': 'Email, code, and new password are required.'}, status=400)
    if len(password) < 8:
        return Response({'detail': 'Password must be at least 8 characters.'}, status=400)

    try:
        user = CustomUser.objects.get(email=email, is_active=True)
        otp  = PasswordResetOTP.objects.get(user=user)
    except (CustomUser.DoesNotExist, PasswordResetOTP.DoesNotExist):
        return Response({'detail': 'Invalid or expired reset code.'}, status=400)

    if otp.is_used:
        return Response({'detail': 'Reset code already used.'}, status=400)
    if otp.is_expired:
        return Response({'detail': 'Reset code expired. Please request a new one.'}, status=400)
    if otp.code != code:
        return Response({'detail': 'Invalid reset code.'}, status=400)

    user.set_password(password)
    user.save(update_fields=['password'])
    otp.is_used = True
    otp.save(update_fields=['is_used'])

    return Response({'detail': 'Password reset successfully. You can now log in.'})


@api_view(['POST'])
@permission_classes([IsCustomer])
def ask_question(request):
    """Send a customer question to all staff and admin email addresses."""
    subject = (request.data.get('subject') or '').strip()
    message = (request.data.get('message') or '').strip()

    if not subject or not message:
        return Response({'detail': 'Subject and message are required.'}, status=400)

    recipients = list(
        CustomUser.objects.filter(role__in=['staff', 'admin'], is_active=True)
        .values_list('email', flat=True)
    )
    if not recipients:
        return Response({'detail': 'No staff available to receive your question. Please try again later.'}, status=503)

    from_name = request.user.get_full_name().strip() or request.user.email
    from_email = request.user.email

    try:
        send_mail(
            subject=f'Customer Question: {subject}',
            message=(
                f'A customer has a question via the SEREN website.\n\n'
                f'From: {from_name} ({from_email})\n'
                f'Subject: {subject}\n\n'
                f'Message:\n{message}'
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=recipients,
            fail_silently=False,
        )
    except Exception:
        return Response({'detail': 'Failed to send your question. Please try again.'}, status=500)

    return Response({'detail': 'Your question has been sent! We\'ll get back to you soon.'})
