"""Explicit USDA SR Legacy mappings and documented household portions.

Brand names use GENERIC references, not brand-specific nutrient claims.
Unqualified 'Toor Dal' is deliberately unresolved (dry versus cooked).
"""
from decimal import Decimal, InvalidOperation
import re

# Keys match canonical_name values in the V4 SQL seed.
ALIASES = {
    # V4.1 verified aliases
    'water': 'plain water',
    'plain water': 'plain water',
    'salt': 'table salt',
    'table salt': 'table salt',
    'red chili powder': 'ground red chili pepper',
    'red chilli powder': 'ground red chili pepper',
    'pure red chili powder': 'ground red chili pepper',
    'ground red chili pepper': 'ground red chili pepper',
    'turmeric': 'ground turmeric',
    'turmeric powder': 'ground turmeric',
    'ground turmeric': 'ground turmeric',
    'cumin seeds': 'cumin seed',
    'cumin seed': 'cumin seed',
    'jeera': 'cumin seed',
    'fresh coriander': 'fresh coriander leaves',
    'fresh coriander leaves': 'fresh coriander leaves',
    'cilantro': 'fresh coriander leaves',

    'aashirvaad atta': 'whole wheat flour',
    'atta': 'whole wheat flour',
    'whole wheat flour': 'whole wheat flour',
    'freedom sunflower oil': 'sunflower oil',
    'sunflower oil': 'sunflower oil',
    'amul butter': 'salted butter',
    'salted butter': 'salted butter',
    'butter': 'salted butter',  # Generic salted assumption; verify package label.
    'toor dal (dry)': 'toor dal dry',
    'toor dal dry': 'toor dal dry',
    'dry toor dal': 'toor dal dry',
    'toor dal (cooked)': 'toor dal cooked',
    'toor dal cooked': 'toor dal cooked',
    'cooked toor dal': 'toor dal cooked',
}
# USDA SR Legacy household measures; 1 US cup = 16 US tablespoons.
CUP_GRAMS = {
    # USDA household portions or explicit standard-volume conversions.
    'table salt': Decimal('288'),  # 1 tsp ~6 g; 1 cup ~288 g
    'ground red chili pepper': Decimal('86.4'), # USDA cayenne 1 tsp 1.8 g
    'ground turmeric': Decimal('105.6'), # 1 tsp 2.2 g (approx household measure)
    'cumin seed': Decimal('96'), # 1 tsp 2 g (approx household measure)
    'fresh coriander leaves': Decimal('16'), # USDA 1/4 cup = 4 g

    'whole wheat flour': Decimal('120'),  # FDC 168893
    'toor dal dry': Decimal('205'),       # FDC 172436
    'toor dal cooked': Decimal('168'),    # FDC 172437
    'sunflower oil': Decimal('217.6'),   # 13.6 g per tbsp, FDC 171025
    'salted butter': Decimal('224'),     # 14 g per tbsp, FDC 173410
}


def parse_amount(quantity):
    if quantity is None:
        return None
    s = str(quantity).strip().replace('½', '1/2').replace('¼', '1/4').replace('¾', '3/4')
    try:
        if re.fullmatch(r'\d+\s+\d+/\d+', s):
            a, b = s.split()
            n, d = b.split('/')
            result = Decimal(a) + Decimal(n) / Decimal(d)
        elif re.fullmatch(r'\d+/\d+', s):
            n, d = s.split('/')
            result = Decimal(n) / Decimal(d)
        else:
            result = Decimal(s)
        return result if result.is_finite() and result > 0 else None
    except (InvalidOperation, ValueError, ZeroDivisionError):
        return None


def identify(name):
    normalized = ' '.join(str(name).strip().casefold().split())
    if normalized in ('toor dal', 'tur dal', 'arhar dal'):
        return None, 'Specify Toor Dal (dry) or Toor Dal (cooked) in recipe ingredients'
    canonical = ALIASES.get(normalized)
    if canonical is None:
        return None, 'No approved food match; add an explicit reference and conversion'
    return canonical, None


def to_grams(quantity, unit, canonical):
    amount = parse_amount(quantity)
    if amount is None or not unit:
        return None
    u = str(unit).strip().casefold()
    if canonical == 'plain water' and u in ('ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres', 'l', 'liter', 'litre', 'liters', 'litres'):
        return float(amount * (1000 if u in ('l', 'liter', 'litre', 'liters', 'litres') else 1))
    if u in ('g', 'gram', 'grams'):
        return float(amount)
    if u in ('kg', 'kilogram', 'kilograms'):
        return float(amount * 1000)
    if canonical not in CUP_GRAMS:
        return None
    if u in ('cup', 'cups'):
        return float(amount * CUP_GRAMS[canonical])
    if u in ('tbsp', 'tablespoon', 'tablespoons'):
        return float(amount * CUP_GRAMS[canonical] / 16)
    if u in ('tsp', 'teaspoon', 'teaspoons'):
        return float(amount * CUP_GRAMS[canonical] / 48)
    return None
