from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, InvalidOperation
from uuid import UUID
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_db
from models import Recipe, RecipeIngredient, NutritionProfile, User
from services.nutrition_engine import FoodNutrients, RecipeIngredientInput, NutritionCalculationInput, calculate_nutrition, NUTRIENTS
from services.nutrition_matching import identify, to_grams, parse_amount

router = APIRouter(prefix='/api/nutrition-intelligence', tags=['Nutrition Intelligence'])

class ServingRequest(BaseModel):
    base_servings: float = Field(default=1, gt=0, le=100)
    prepared_servings: float = Field(default=1, gt=0, le=100)
    eaten_servings: float = Field(default=1, ge=0, le=100)
    # Optional explicit dry/cooked selection for ambiguous raw recipe ingredients.
    ingredient_states: dict[str, str] = Field(default_factory=dict)

class LogRequest(ServingRequest):
    recipe_id: int
    eaten_servings: float = Field(gt=0, le=100)


def amount_in_grams(quantity, unit):
    """Convert only mass units with unambiguous meaning; no invented cup/piece weights."""
    if quantity is None or unit is None:
        return None
    try:
        q = str(quantity).strip().replace('½', '1/2').replace('¼', '1/4').replace('¾', '3/4')
        if re.fullmatch(r'\d+\s+\d+/\d+', q):
            whole, frac = q.split()
            n, d = frac.split('/')
            amount = Decimal(whole) + Decimal(n) / Decimal(d)
        elif re.fullmatch(r'\d+/\d+', q):
            n, d = q.split('/')
            amount = Decimal(n) / Decimal(d)
        else:
            amount = Decimal(q)
        if not amount.is_finite() or amount <= 0:
            return None
    except (InvalidOperation, ValueError, ZeroDivisionError):
        return None
    u = unit.strip().lower()
    factor = {'g': 1, 'gram': 1, 'grams': 1, 'kg': 1000, 'kilogram': 1000, 'kilograms': 1000}.get(u)
    return float(amount * factor) if factor else None


async def compute(db, recipe_id, req):
    recipe = await db.get(Recipe, recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail='Recipe not found')
    if req.eaten_servings > req.prepared_servings:
        raise HTTPException(status_code=422, detail='Eaten servings cannot exceed prepared servings')
    rows = (await db.execute(select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe_id))).scalars().all()
    references = (await db.execute(text('SELECT * FROM public.nutrition_food_reference'))).mappings().all()
    # Exact canonical name only: avoids misidentifying branded/processed ingredients.
    lookup = {str(r['canonical_name']).strip().casefold(): r for r in references}
    valid = []
    excluded = []
    multiplier = req.prepared_servings / req.base_servings
    scaled = []
    for ing in rows:
        name = ing.name.strip()
        # A bare Toor Dal recipe ingredient defaults to dry *as an openly labelled
        # assumption*. Callers can override it with 'dry' or 'cooked'.
        # This is not an Amul/brand-specific nutrient measurement.
        ingredient_key = str(ing.id)
        state = req.ingredient_states.get(ingredient_key) or req.ingredient_states.get(name.casefold())
        if state is not None and state not in ('dry', 'cooked'):
            raise HTTPException(status_code=422, detail='Ingredient state must be dry or cooked')
        ambiguous_dal = name.casefold() in ('toor dal', 'tur dal', 'arhar dal')
        effective_name = f'toor dal ({state or "dry"})' if ambiguous_dal else name
        canonical, match_error = identify(effective_name)
        grams = to_grams(ing.quantity, ing.unit, canonical) if canonical else None
        try:
            original = parse_amount(ing.quantity)
            if original is None:
                raise ValueError('Invalid quantity')
            scaled_quantity = str((original * Decimal(str(multiplier))).normalize())
        except (InvalidOperation, ValueError):
            scaled_quantity = None
        scaled.append({'id': ing.id, 'name': name, 'original_quantity': ing.quantity, 'unit': ing.unit, 'prepared_quantity': scaled_quantity, 'prepared_grams': round(grams * multiplier, 2) if grams else None, 'nutrition_state': state or ('dry' if ambiguous_dal else None), 'assumed_state': bool(ambiguous_dal and not state)})
        if grams is None:
            excluded.append({'name': name, 'reason': match_error or 'Unsupported quantity or unit for this ingredient'})
            continue
        ref = lookup.get(canonical)
        if ref is None:
            excluded.append({'name': name, 'reason': 'No verified nutrient reference found for ' + str(canonical)})
        food = None
        if ref:
            food = FoodNutrients(food_name=name, source=str(ref['source_name']), per_100g={
                key: float(ref[col]) if ref[col] is not None else None
                for key, col in {
                    'calories_kcal': 'calories_kcal_per_100g', 'protein_g': 'protein_g_per_100g',
                    'carbs_g': 'carbs_g_per_100g', 'fat_g': 'fat_g_per_100g',
                    'fiber_g': 'fiber_g_per_100g', 'iron_mg': 'iron_mg_per_100g',
                    'calcium_mg': 'calcium_mg_per_100g', 'potassium_mg': 'potassium_mg_per_100g'
                }.items()})
        valid.append(RecipeIngredientInput(name=name, grams_for_base_recipe=grams, food=food))
    result = calculate_nutrition(NutritionCalculationInput(
        base_servings=req.base_servings, prepared_servings=req.prepared_servings,
        eaten_servings=req.eaten_servings, ingredients=valid))
    # No complete totals when even one recipe ingredient was excluded.
    if excluded:
        for section in ('batch_nutrition', 'per_serving_nutrition', 'consumed_nutrition'):
            result[section] = {k: None for k in NUTRIENTS}
        result['missing_nutrient_data'] = list(NUTRIENTS)
    result.update(recipe_id=recipe_id, recipe_title=recipe.title, scaled_ingredients=scaled, unresolved_ingredients=excluded,
                  complete=not excluded and not result['missing_nutrient_data'] and bool(rows))
    return result

@router.post('/recipes/{recipe_id}/calculate')
async def calculate_recipe(recipe_id: int, req: ServingRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await compute(db, recipe_id, req)

@router.post('/meals')
async def log_meal(req: LogRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await compute(db, req.recipe_id, req)
    if any(i.get('assumed_state') for i in result['scaled_ingredients']):
        raise HTTPException(status_code=422, detail='Choose dry or cooked for Toor Dal before logging')
    if not result['complete']:
        raise HTTPException(status_code=422, detail='Nutrition data is incomplete. Resolve ingredient quantities and nutrient references before logging.')
    row = (await db.execute(text('''
        INSERT INTO public.nutrition_meal_logs
        (user_id, recipe_id, recipe_title, prepared_servings, eaten_servings, nutrient_snapshot, ingredient_snapshot)
        VALUES (:user_id, :recipe_id, :title, :prepared, :eaten, CAST(:nutrients AS jsonb), CAST(:ingredients AS jsonb))
        RETURNING id, consumed_at
    '''), {'user_id': current_user.id, 'recipe_id': req.recipe_id, 'title': result['recipe_title'],
           'prepared': req.prepared_servings, 'eaten': req.eaten_servings,
           'nutrients': __import__('json').dumps(result['consumed_nutrition']),
           'ingredients': __import__('json').dumps(result['scaled_ingredients'])})).mappings().one()
    await db.commit()
    return {'id': str(row['id']), 'consumed_at': row['consumed_at'].isoformat(), 'nutrition': result['consumed_nutrition']}

@router.get('/daily')
async def daily(day: date | None = None, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    target = day or datetime.now(timezone.utc).date()
    start = datetime.combine(target, time.min, tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    rows = (await db.execute(text('''
        SELECT id, recipe_title, eaten_servings, consumed_at, nutrient_snapshot
        FROM public.nutrition_meal_logs WHERE user_id = :user_id AND consumed_at >= :start AND consumed_at < :end
        ORDER BY consumed_at DESC
    '''), {'user_id': current_user.id, 'start': start, 'end': end})).mappings().all()
    totals = {k: 0.0 for k in NUTRIENTS}
    for row in rows:
        for k in NUTRIENTS:
            v = row['nutrient_snapshot'].get(k)
            if v is not None:
                totals[k] += float(v)
    profile = await db.get(NutritionProfile, current_user.id)
    goals = {'calories_kcal': profile.daily_calorie_target if profile else None,
             'protein_g': profile.daily_protein_target_g if profile else None,
             'fiber_g': profile.daily_fiber_target_g if profile else None}
    return {'date': target.isoformat(), 'timezone': 'UTC', 'totals': {k: round(v, 2) for k,v in totals.items()},
            'goals': goals, 'meals': [{'id': str(r['id']), 'recipe_title': r['recipe_title'],
             'eaten_servings': float(r['eaten_servings']), 'consumed_at': r['consumed_at'].isoformat(),
             'nutrients': r['nutrient_snapshot']} for r in rows]}

@router.delete('/meals/{meal_id}')
async def delete_meal(meal_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    row = (await db.execute(text('DELETE FROM public.nutrition_meal_logs WHERE id = :id AND user_id = :uid RETURNING id'),
                            {'id': meal_id, 'uid': current_user.id})).first()
    if not row:
        raise HTTPException(status_code=404, detail='Meal not found')
    await db.commit()
    return {'deleted': True}
