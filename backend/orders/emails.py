from django.conf import settings
from django.core.mail import EmailMultiAlternatives, send_mail
from django.template.loader import render_to_string


def send_order_invoice(order):
    subject = f'Order Confirmed - Seren #{order.id}'
    html = f"""
    <div style='font-family:Arial,sans-serif'>
      <h2>Seren</h2>
      <p>Thank you for your order, {order.customer.get_full_name() or order.customer.email}!</p>
      <p>Order number: <strong>#{order.id}</strong><br/>Date: {order.created_at:%Y-%m-%d %H:%M}</p>
      <ul>
        {''.join([f'<li>{i.product_name} ({i.size}) x {i.quantity} - NPR {i.price_at_purchase}</li>' for i in order.items.all()])}
      </ul>
      <p><strong>Total: NPR {order.total_amount}</strong></p>
      <p>Payment: Cash on Delivery</p>
      <p>Our team will call you at {order.customer_phone} to confirm your order before shipping.</p>
      <p>You will receive your order once our team confirms.</p>
      <p>Contact: {getattr(settings, 'CLIENT_EMAIL', 'client@seren.com')}</p>
    </div>
    """
    msg = EmailMultiAlternatives(subject, '', settings.DEFAULT_FROM_EMAIL, [order.customer.email])
    msg.attach_alternative(html, 'text/html')
    msg.send(fail_silently=True)


def send_new_order_alert(order):
    from accounts.models import CustomUser

    recipients = list(
        CustomUser.objects.filter(role__in=['staff', 'admin'], is_active=True)
        .values_list('email', flat=True)
    )
    client_email = getattr(settings, 'CLIENT_EMAIL', '')
    if client_email and client_email not in recipients:
        recipients.append(client_email)
    if not recipients:
        return

    subject = f'New Order #{order.id} - Seren'
    lines = [
        f'Order #{order.id}',
        f'Customer: {order.customer.get_full_name() or order.customer.email}',
        f'Phone: {order.customer_phone}',
        f'Date: {order.created_at:%Y-%m-%d %H:%M}',
        'Items:',
    ]
    for item in order.items.all():
        lines.append(f'- {item.product_name} ({item.size}) x {item.quantity} @ NPR {item.price_at_purchase}')
    lines.append(f'Total: NPR {order.total_amount}')
    lines.append('Log in to the staff dashboard to confirm this order.')
    send_mail(subject, '\n'.join(lines), settings.DEFAULT_FROM_EMAIL, recipients, fail_silently=True)


def send_review_alert(order, reviews_data):
    """Notify all staff/admin accounts when a customer submits reviews for a completed order."""
    from accounts.models import CustomUser

    recipients = list(
        CustomUser.objects.filter(role__in=['staff', 'admin'], is_active=True)
        .values_list('email', flat=True)
    )
    client_email = getattr(settings, 'CLIENT_EMAIL', '')
    if client_email and client_email not in recipients:
        recipients.append(client_email)
    if not recipients:
        return

    customer_name = order.customer.get_full_name().strip() or order.customer.email
    subject = f'New Review — Order #{order.id} — Seren'

    review_lines = []
    for r in reviews_data:
        stars = '★' * r['rating'] + '☆' * (5 - r['rating'])
        line = f"  {r['product_name']}  {stars} ({r['rating']}/5)"
        if r.get('body'):
            line += f'\n    "{r["body"]}"'
        review_lines.append(line)

    body = (
        f'Customer: {customer_name}\n'
        f'Order #: {order.id}\n\n'
        'Reviews submitted:\n'
        + '\n'.join(review_lines)
        + '\n\nLog in to the staff dashboard to view order details.'
    )

    send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, recipients, fail_silently=True)
