import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0005_add_print_fields'),
    ]

    operations = [
        migrations.CreateModel(
            name='DeliveryLocation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('coverage', models.CharField(blank=True, default='', max_length=500)),
                ('district', models.CharField(blank=True, default='', max_length=100)),
                ('charge', models.IntegerField()),
                ('is_active', models.BooleanField(default=True)),
            ],
            options={
                'ordering': ['district', 'name'],
            },
        ),
        migrations.AddField(
            model_name='order',
            name='delivery_charge',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='order',
            name='delivery_location',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                to='orders.deliverylocation',
            ),
        ),
    ]
