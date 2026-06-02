import random
from datetime import timedelta

from django.contrib.auth import authenticate
from django.utils import timezone
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import CustomUser, EmailVerification


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    username_field = CustomUser.EMAIL_FIELD

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        token['is_verified'] = user.is_verified
        token['name'] = user.get_full_name().strip() or user.email
        return token

    def validate(self, attrs):
        email = attrs.get('email', '').strip().lower()
        password = attrs.get('password', '')
        user = authenticate(request=self.context.get('request'), email=email, password=password)
        if not user:
            raise serializers.ValidationError({'detail': 'Invalid email or password.'})
        if user.role == 'customer' and not user.is_verified:
            raise serializers.ValidationError({'detail': 'Please verify your email first.'}, code='not_verified')
        if not user.is_active:
            raise serializers.ValidationError({'detail': 'Account is inactive.'})

        refresh = self.get_token(user)
        return {
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'role': user.role,
            'is_verified': user.is_verified,
            'name': user.get_full_name().strip() or user.email,
            'email': user.email,
        }


class RegisterSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=180)
    email = serializers.EmailField()
    password = serializers.CharField(min_length=8, write_only=True)

    def validate_email(self, value):
        email = value.strip().lower()
        if CustomUser.objects.filter(email=email).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return email

    def create(self, validated_data):
        full_name = validated_data['name'].strip()
        first_name, last_name = (full_name.split(' ', 1) + [''])[:2]
        user = CustomUser.objects.create_user(
            email=validated_data['email'],
            password=validated_data['password'],
            first_name=first_name,
            last_name=last_name,
            role='customer',
            is_verified=False,
            is_active=True,
        )
        code = str(random.randint(100000, 999999))
        EmailVerification.objects.create(
            user=user,
            code=code,
            expires_at=timezone.now() + timedelta(minutes=10),
        )
        return user, code


class VerifyEmailSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(max_length=6)


class ResendOtpSerializer(serializers.Serializer):
    email = serializers.EmailField()


class UserListSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()

    class Meta:
        model = CustomUser
        fields = ['id', 'name', 'email', 'role', 'is_verified', 'is_active', 'date_joined']

    def get_name(self, obj):
        return obj.get_full_name().strip() or obj.email


class UserUpdateSerializer(serializers.ModelSerializer):
    name = serializers.CharField(required=False)
    password = serializers.CharField(required=False, write_only=True, min_length=8)
    role = serializers.ChoiceField(choices=['customer', 'staff'], required=False)

    class Meta:
        model = CustomUser
        fields = ['name', 'email', 'role', 'password']

    def update(self, instance, validated_data):
        if 'name' in validated_data:
            full_name = validated_data.pop('name').strip()
            first_name, last_name = (full_name.split(' ', 1) + [''])[:2]
            instance.first_name = first_name
            instance.last_name = last_name
        if 'email' in validated_data:
            instance.email = validated_data.pop('email').strip().lower()
        if 'role' in validated_data:
            instance.role = validated_data.pop('role')
        password = validated_data.pop('password', None)
        for k, v in validated_data.items():
            setattr(instance, k, v)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class CreateStaffSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=180)
    email = serializers.EmailField()
    password = serializers.CharField(min_length=8)

    def validate_email(self, value):
        email = value.strip().lower()
        if CustomUser.objects.filter(email=email).exists():
            raise serializers.ValidationError('Email already in use.')
        return email

    def create(self, validated_data):
        full_name = validated_data['name'].strip()
        first_name, last_name = (full_name.split(' ', 1) + [''])[:2]
        return CustomUser.objects.create_user(
            email=validated_data['email'],
            password=validated_data['password'],
            first_name=first_name,
            last_name=last_name,
            role='staff',
            is_verified=True,
            is_staff=True,
            is_active=True,
        )
