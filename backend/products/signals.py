from django.conf import settings
from django.core.mail import send_mail
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from .models import ProductSize


def _staff_email_list():
    from accounts.models import CustomUser
    recipients = list(
        CustomUser.objects.filter(role__in=['staff', 'admin'], is_active=True)
        .values_list('email', flat=True)
    )
    client_email = getattr(settings, 'CLIENT_EMAIL', '')
    if client_email and client_email not in recipients:
        recipients.append(client_email)
    return recipients


@receiver(post_save, sender=ProductSize)
def stock_alerts(sender, instance, **kwargs):
    product = instance.product
    product.stock_last_changed = timezone.now()
    product.save(update_fields=['stock_last_changed'])

    recipients = _staff_email_list()
    if not recipients:
        return

    if instance.quantity == 0:
        subject = f'Out of stock: {product.name} ({instance.size})'
        body = f'{product.name} ({instance.size}) is now out of stock.'
    elif instance.quantity in {1, 2}:
        subject = f'Low stock alert: {product.name} ({instance.size}) - only {instance.quantity} left'
        body = f'{product.name} ({instance.size}) is low stock: {instance.quantity} remaining.'
    else:
        return

    send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, recipients, fail_silently=True)
