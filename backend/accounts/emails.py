from django.conf import settings
from django.core.mail import send_mail


def send_verification_email(user, code):
    send_mail(
        subject='Seren Email Verification Code',
        message=(
            f'Hello {user.first_name or user.email},\n\n'
            f'Your Seren verification code is: {code}\n'
            'This code expires in 10 minutes.\n\n'
            'If you did not request this, please ignore this email.'
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


def send_password_reset_email(user, code):
    send_mail(
        subject='Seren Password Reset Code',
        message=(
            f'Hello {user.first_name or user.email},\n\n'
            f'Your password reset code is: {code}\n'
            'This code expires in 10 minutes.\n\n'
            'If you did not request this, please ignore this email.'
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


def send_welcome_email(user):
    send_mail(
        subject='Welcome to Seren',
        message=(
            f'Hi {user.first_name or user.email},\n\n'
            'Your Seren account is verified and ready to use. Enjoy shopping!'
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )
