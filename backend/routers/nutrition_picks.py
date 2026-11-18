"""Pantry-first recommendations from actual saved recipes, with verified batch nutrition only.

No AI-generated recipe is created here. Values are computed only when all needed
references and measures are available. User must verify portion yields and restrictions.
"""
from collections import defaultdict
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends
from auth import get_current_user
from db import get_db
from models import PantryItem, Recipe, RecipeIngredient, User, NutritionProfile
from services.nutrition_matching import identify, to_grams

router = APIRouter(prefix="/api/nutrition-intelligence", tags=["Nutrition Intelligence"])


def _norm(s):
    s = ' '.join(str(s or '').casefold().strip().split())
    return s[:-1] if s.endswith('s') and len(s)>4 else s

@router.get('/recipe-picks')
async def existing_recipe_picks(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    recipes=(await db.execute(select(Recipe))).scalars().all()
    ingredients=(await db.execute(select(RecipeIngredient))).scalars().all()
    pantry=(await db.execute(select(PantryItem).where(PantryItem.user_id==current_user.id))).scalars().all()
    refs=(await db.execute(text('SELECT * FROM public.nutrition_food_reference'))).mappings().all()
    lookup={_norm(r['canonical_name']):r for r in refs}
    pantry_names={_norm(p.name) for p in pantry}
    profile=await db.get(NutritionProfile,current_user.id)
    nutrient_goals=set(str(g).casefold() for g in (profile.nutrition_goals or [])) if profile else set()
    protein_focus=any('protein' in g or 'muscle' in g for g in nutrient_goals)
    fiber_focus=any('fiber' in g or 'digest' in g for g in nutrient_goals)
    groups=defaultdict(list)
    for ingredient in ingredients:groups[ingredient.recipe_id].append(ingredient)
    result=[]
    for recipe in recipes:
        items=groups[recipe.id]
        if not items:continue
        available=0;protein=0.0;fiber=0.0;known=0;uncertain=[]
        for ing in items:
            original=_norm(ing.name)
            canonical, err=identify(ing.name)
            if canonical is None and original in lookup: canonical=original
            if original in pantry_names or (canonical is not None and _norm(canonical) in pantry_names):
                available+=1
            ref=lookup.get(_norm(canonical)) if canonical else None
            grams=to_grams(ing.quantity,ing.unit,canonical) if canonical else None
            if ref is None or grams is None or ref['protein_g_per_100g'] is None or ref['fiber_g_per_100g'] is None:
                uncertain.append(ing.name)
                continue
            known+=1
            protein+=float(ref['protein_g_per_100g'])*grams/100
            fiber+=float(ref['fiber_g_per_100g'])*grams/100
        fully_verified=known==len(items)
        ratio=round(100*available/len(items))
        # Nutritional scoring only for wholly verified recipes; compare BATCH values,
        # never assert per-serving values without a stored recipe yield.
        nutrient_score=(min(protein,40)* (1.2 if protein_focus else 0.8)
            +min(fiber,20)*(1.5 if fiber_focus else 0.9)) if fully_verified else 0
        result.append({
            'recipe_id':recipe.id,'title':recipe.title,'pantry_match_percentage':ratio,
            'missing_ingredients':[ing.name for ing in items if _norm(ing.name) not in pantry_names],
            'nutrition_verified':fully_verified,'protein_g_batch':round(protein,1) if fully_verified else None,
            'fiber_g_batch':round(fiber,1) if fully_verified else None,
            'unresolved_ingredients':uncertain,
            'score':ratio*0.8+(nutrient_score if fully_verified else 0)
        })
    verified=sorted((r for r in result if r['nutrition_verified']),key=lambda x:x['score'],reverse=True)
    others=sorted((r for r in result if not r['nutrition_verified']),key=lambda x:x['pantry_match_percentage'],reverse=True)
    return {'existing_recipes_first':verified[:6], 'pantry_friendly_needs_nutrition_data':others[:6],
            'count_existing':len(result), 'count_fully_verified':len(verified),
            'note':'Protein and fiber numbers cover the whole recipe ingredient batch, not a serving. Check dietary restrictions and confirm recipe yield.'}
