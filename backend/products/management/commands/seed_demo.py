"""
Management command: seed_demo
Populates the database with realistic demo data for the Seren Nepal shop.
Safe to run multiple times — uses get_or_create so nothing is duplicated.
"""
from django.core.management.base import BaseCommand
from products.models import (
    BouquetFlower,
    BouquetWrapping,
    Label,
    Product,
    ProductSize,
)


# ── Label definitions ─────────────────────────────────────────────────────────
LABELS = {
    'kits':     ['Home Kit', 'Away Kit', 'Limited Edition', 'Sale'],
    'crochet':  ['Handmade', 'Custom Order', 'Bestseller'],
    'clothing': ['New Arrival', 'Sale', 'Streetwear'],
}

# ── Product definitions ───────────────────────────────────────────────────────
# Each entry: (name, price, description, labels[], sizes[(size, qty)], is_hot_pick)
KITS = [
    (
        'Nepal National Team Home Kit 2024/25',
        2800,
        'Official Nepal national football team home kit. Bold red and white design with ANFA crest. Made with breathable performance fabric.',
        ['Home Kit'],
        [('S', 12), ('M', 20), ('L', 15), ('XL', 8)],
        True,
    ),
    (
        'Manchester City Away Kit 2024/25',
        3200,
        'Manchester City away kit in stunning maroon. Slim-fit silhouette with moisture-wicking technology.',
        ['Away Kit'],
        [('S', 8), ('M', 15), ('L', 10), ('XL', 6)],
        False,
    ),
    (
        'Real Madrid Home Kit 2024/25',
        3500,
        'Classic all-white Real Madrid home jersey with Adidas Climacool technology. Limited stock available.',
        ['Home Kit', 'Limited Edition'],
        [('S', 5), ('M', 10), ('L', 8)],
        True,
    ),
    (
        'FC Barcelona Home Kit 2024/25',
        3200,
        'Iconic blue and red stripes of FC Barcelona. Official grade replica with embroidered crest.',
        ['Home Kit'],
        [('M', 12), ('L', 18), ('XL', 10)],
        False,
    ),
    (
        'Argentina Home Kit 2024/25',
        3000,
        'World champion Argentina sky blue and white stripes. AFA badge, lightweight mesh fabric.',
        ['Home Kit', 'Sale'],
        [('S', 10), ('M', 20), ('L', 14), ('XL', 7)],
        False,
    ),
    (
        'Manchester United Away Kit 2024/25',
        2800,
        'Manchester United away kit in sharp black. Relaxed fit with Dri-FIT ADV technology.',
        ['Away Kit', 'Sale'],
        [('S', 9), ('M', 14), ('L', 11)],
        False,
    ),
]

CROCHETS = [
    (
        'Crochet Tote Bag',
        850,
        'Handcrafted open-weave tote bag. Sturdy cotton yarn, perfect for daily use or the beach. Each piece is unique.',
        ['Handmade', 'Bestseller'],
        [('Free Size', 30)],
        True,
    ),
    (
        'Crochet Bucket Hat',
        650,
        'Trendy crochet bucket hat in neutral tones. Lightweight and breathable, one size fits most.',
        ['Handmade'],
        [('Free Size', 25)],
        False,
    ),
    (
        'Flower Bouquet',
        1100,
        'Everlasting crochet flower bouquet. A beautiful handmade gift option — never wilts, always blooms.',
        ['Handmade', 'Custom Order'],
        [('Free Size', 20)],
        False,
    ),
    (
        'Phone Pouch',
        350,
        'Compact crochet phone pouch with a secure button closure. Fits most standard-size phones.',
        ['Handmade'],
        [('Free Size', 40)],
        False,
    ),
    (
        'Crochet Headband',
        300,
        'Soft and stretchy crochet headband. Keeps hair in place while looking effortlessly cute.',
        ['Handmade', 'Bestseller'],
        [('Free Size', 50)],
        False,
    ),
]

CLOTHING = [
    (
        'Oversized Hoodie',
        2800,
        'Premium heavyweight oversized hoodie. Brushed fleece interior, dropped shoulders, kangaroo pocket. Available in multiple colours.',
        ['New Arrival', 'Streetwear'],
        [('S', 15), ('M', 20), ('L', 18), ('XL', 10)],
        True,
    ),
    (
        'Graphic Tee',
        1200,
        'Bold graphic tee printed on 100% cotton. Relaxed fit, pre-shrunk fabric. Statement piece for everyday wear.',
        ['Streetwear'],
        [('S', 20), ('M', 25), ('L', 20), ('XL', 15)],
        True,
    ),
    (
        'Track Pants',
        1800,
        'Slim-tapered track pants with side stripe detail. Elasticated waist with drawstring, zip pockets.',
        ['Streetwear'],
        [('S', 12), ('M', 15), ('L', 14), ('XL', 8)],
        False,
    ),
    (
        'Cargo Shorts',
        1500,
        'Utility cargo shorts with six pockets. Durable ripstop fabric, perfect for summer and outdoor activity.',
        ['New Arrival'],
        [('S', 10), ('M', 18), ('L', 15), ('XL', 10)],
        False,
    ),
    (
        'Bomber Jacket',
        3500,
        'Classic bomber jacket with ribbed cuffs and hem. Lightweight satin shell with quilted lining.',
        ['New Arrival'],
        [('S', 7), ('M', 12), ('L', 10), ('XL', 5)],
        False,
    ),
]

# ── Bouquet data ──────────────────────────────────────────────────────────────
FLOWERS = [
    ('Rose',      120, 20),
    ('Sunflower', 100, 20),
    ('Tulip',     150, 20),
    ('Lily',      180, 20),
    ('Daisy',      80, 20),
    ('Carnation',  90, 20),
]

WRAPPINGS = [
    ('Kraft Paper',    150),
    ('Satin Ribbon',   250),
    ('Jute Wrap',      200),
    ('Cellophane',     100),
]


class Command(BaseCommand):
    help = 'Seed the database with demo products, labels, flowers, and wrappings.'

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING('Seeding demo data…'))

        # ── 1. Labels ──────────────────────────────────────────────────────────
        label_objs = {}
        for category, names in LABELS.items():
            for name in names:
                obj, created = Label.objects.get_or_create(
                    name=name,
                    category=category,
                    defaults={'is_predefined': True},
                )
                if not created and not obj.is_predefined:
                    obj.is_predefined = True
                    obj.save(update_fields=['is_predefined'])
                label_objs[(category, name)] = obj
                self.stdout.write(f"  {'Created' if created else 'Exists '} label: [{category}] {name}")

        # ── 2. Products helper ─────────────────────────────────────────────────
        def seed_products(entries, category):
            for name, price, description, label_names, sizes, is_hot_pick in entries:
                product, created = Product.objects.get_or_create(
                    name=name,
                    defaults={
                        'description': description,
                        'category': category,
                        'price': price,
                        'is_active': True,
                        'is_hot_pick': is_hot_pick,
                    },
                )
                action = 'Created' if created else 'Exists '
                self.stdout.write(f"  {action} product: {name}")

                if created:
                    # assign labels
                    for lname in label_names:
                        lobj = label_objs.get((category, lname))
                        if lobj:
                            product.labels.add(lobj)
                    # create sizes
                    for size, qty in sizes:
                        ProductSize.objects.create(product=product, size=size, quantity=qty)
                else:
                    # ensure sizes exist if somehow missing
                    for size, qty in sizes:
                        ProductSize.objects.get_or_create(
                            product=product,
                            size=size,
                            defaults={'quantity': qty},
                        )

        self.stdout.write(self.style.MIGRATE_HEADING('\nSeeding kits…'))
        seed_products(KITS, 'kits')

        self.stdout.write(self.style.MIGRATE_HEADING('\nSeeding crochet…'))
        seed_products(CROCHETS, 'crochet')

        self.stdout.write(self.style.MIGRATE_HEADING('\nSeeding clothing…'))
        seed_products(CLOTHING, 'clothing')

        # ── 3. Bouquet flowers ─────────────────────────────────────────────────
        self.stdout.write(self.style.MIGRATE_HEADING('\nSeeding bouquet flowers…'))
        for name, price_per_unit, max_qty in FLOWERS:
            obj, created = BouquetFlower.objects.get_or_create(
                name=name,
                defaults={
                    'price_per_unit': price_per_unit,
                    'max_quantity_per_bouquet': max_qty,
                    'is_active': True,
                },
            )
            self.stdout.write(f"  {'Created' if created else 'Exists '} flower: {name}")

        # ── 4. Bouquet wrappings ───────────────────────────────────────────────
        self.stdout.write(self.style.MIGRATE_HEADING('\nSeeding bouquet wrappings…'))
        for name, price in WRAPPINGS:
            obj, created = BouquetWrapping.objects.get_or_create(
                name=name,
                defaults={'price': price, 'is_active': True},
            )
            self.stdout.write(f"  {'Created' if created else 'Exists '} wrapping: {name}")

        # ── Summary ────────────────────────────────────────────────────────────
        hot_count = Product.objects.filter(is_hot_pick=True).count()
        self.stdout.write(self.style.SUCCESS(
            f'\nDone! Hot picks in DB: {hot_count}/5'
        ))
        if hot_count > 5:
            self.stdout.write(self.style.WARNING(
                '  Warning: more than 5 hot picks exist. '
                'Go to the dashboard and remove the extras.'
            ))
