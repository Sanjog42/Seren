"""
One-shot script: create (if missing) + set sizes/stock/labels for the 7 clothing products.

Run with:
    python set_clothing_stock.py

T-Shirts (Starboy, Speed, Sakura, CBR) -> M + XL, 13 pieces each, NPR 1,300  label: T-Shirt
Hoodies  (Tulip, Pokemon, Zaza)         -> Free Size, 10 pieces,    NPR 2,000  label: Hoodie
"""
import os, sys, django
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "jersey_store.settings")
django.setup()

from products.models import Label, Product, ProductSize

# ── Product definitions ────────────────────────────────────────────────────────
PRODUCTS = [
    # (name,       price,    label,      sizes_and_qty)
    ("Starboy",  "1300.00", "T-Shirt",  [("M", 13), ("XL", 13)]),
    ("Speed",    "1300.00", "T-Shirt",  [("M", 13), ("XL", 13)]),
    ("Sakura",   "1300.00", "T-Shirt",  [("M", 13), ("XL", 13)]),
    ("CBR",      "1300.00", "T-Shirt",  [("M", 13), ("XL", 13)]),
    ("Tulip",    "2000.00", "Hoodie",   [("Free Size", 10)]),
    ("Pokemon",  "2000.00", "Hoodie",   [("Free Size", 10)]),
    ("Zaza",     "2000.00", "Hoodie",   [("Free Size", 10)]),
]


def get_or_create_label(name):
    lbl, created = Label.objects.get_or_create(
        name=name, category="clothing",
    )
    if created:
        print(f"  [NEW LABEL]   Created label: {name}")
    return lbl


def get_or_create_product(name, price):
    p, created = Product.objects.get_or_create(
        name=name,
        category="clothing",
        defaults={
            "price": Decimal(price),
            "description": "",
            "is_active": True,
        },
    )
    if created:
        print(f"  [NEW PRODUCT] Created: {name} @ NPR {price}")
    else:
        print(f"  [PRODUCT OK]  Found:   {name}")
    return p


def set_sizes(product, size_spec):
    for size_name, qty in size_spec:
        obj, created = ProductSize.objects.get_or_create(
            product=product, size=size_name,
            defaults={"quantity": qty},
        )
        if not created and obj.quantity != qty:
            obj.quantity = qty
            obj.save(update_fields=["quantity"])
            print(f"    Updated  size={size_name}: qty={qty}")
        elif created:
            print(f"    Created  size={size_name}: qty={qty}")
        else:
            print(f"    OK       size={size_name}: qty={qty}")


def set_label(product, label):
    if not product.labels.filter(pk=label.pk).exists():
        product.labels.add(label)
        print(f"    Assigned label: {label.name}")
    else:
        print(f"    Label OK: {label.name}")


def run():
    print("Setting up clothing products...\n")

    # Ensure both type labels exist
    tshirt_label = get_or_create_label("T-Shirt")
    hoodie_label = get_or_create_label("Hoodie")
    label_map = {"T-Shirt": tshirt_label, "Hoodie": hoodie_label}
    print()

    for name, price, label_name, sizes in PRODUCTS:
        p = get_or_create_product(name, price)
        set_sizes(p, sizes)
        set_label(p, label_map[label_name])
        print()

    print("Done! All 7 clothing products are ready.")
    print("Add product images via the staff/admin dashboard.")


if __name__ == "__main__":
    run()
