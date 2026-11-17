"""CookMate ingredient-based nutrition calculations.

Values must be supplied from a verified food-composition source, per 100 g.
No nutrition values are invented by this module.
"""
from __future__ import annotations
from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from pydantic import BaseModel, Field, model_validator

NUTRIENTS = ('calories_kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'iron_mg', 'calcium_mg', 'potassium_mg')

class FoodNutrients(BaseModel):
    food_name: str
    source: str
    per_100g: dict[str, float | None]

class RecipeIngredientInput(BaseModel):
    name: str
    grams_for_base_recipe: float = Field(gt=0)
    food: FoodNutrients | None = None

class NutritionCalculationInput(BaseModel):
    base_servings: float = Field(gt=0)
    prepared_servings: float = Field(gt=0)
    eaten_servings: float = Field(ge=0)
    ingredients: list[RecipeIngredientInput]

    @model_validator(mode='after')
    def validate_eaten(self):
        if self.eaten_servings > self.prepared_servings:
            raise ValueError('Eaten servings cannot exceed prepared servings')
        return self

def _round(value: float) -> float:
    return float(Decimal(str(value)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))

def calculate_nutrition(data: NutritionCalculationInput) -> dict[str, Any]:
    multiplier = data.prepared_servings / data.base_servings
    consumed_share = data.eaten_servings / data.prepared_servings
    batch = {key: 0.0 for key in NUTRIENTS}
    coverage = {key: True for key in NUTRIENTS}
    breakdown = []
    for ingredient in data.ingredients:
        grams = ingredient.grams_for_base_recipe * multiplier
        amounts = {}
        for key in NUTRIENTS:
            value = ingredient.food.per_100g.get(key) if ingredient.food else None
            if value is None:
                coverage[key] = False
                amounts[key] = None
            else:
                contribution = float(value) * grams / 100
                batch[key] += contribution
                amounts[key] = _round(contribution)
        breakdown.append({'ingredient': ingredient.name,
                          'prepared_grams': _round(grams),
                          'source': ingredient.food.source if ingredient.food else None,
                          'batch_nutrients': amounts})
    # Unknown source values are not silently counted as zero.
    totals = {key: (_round(batch[key]) if coverage[key] else None) for key in NUTRIENTS}
    return {
        'base_servings': data.base_servings,
        'prepared_servings': data.prepared_servings,
        'eaten_servings': data.eaten_servings,
        'remaining_servings': _round(data.prepared_servings - data.eaten_servings),
        'ingredients': breakdown,
        'batch_nutrition': totals,
        'per_serving_nutrition': {k: _round(v / data.prepared_servings) if v is not None else None for k, v in totals.items()},
        'consumed_nutrition': {k: _round(v * consumed_share) if v is not None else None for k, v in totals.items()},
        'missing_nutrient_data': [k for k in NUTRIENTS if not coverage[k]],
    }
