from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_db
from models import PantryItem, Recipe, RecipeIngredient, User

router = APIRouter(
    prefix="/api/recipes",
    tags=["Recipe Matching"],
)


def normalize_name(name: str) -> str:
    name = name.strip().casefold()

    plural_map = {
        "potatoes": "potato",
        "tomatoes": "tomato",
        "onions": "onion",
        "eggs": "egg",
        "carrots": "carrot",
        "apples": "apple",
        "bananas": "banana",
        "oranges": "orange",
        "lemons": "lemon",
        "chilies": "chili",
        "chillies": "chili",
    }

    return plural_map.get(name, name)


@router.get("/matches")
async def get_recipe_matches(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Get the user's pantry.
    pantry_result = await db.execute(
        select(PantryItem).where(
            PantryItem.user_id == current_user.id
        )
    )

    pantry_items = pantry_result.scalars().all()

    pantry_names = {
        normalize_name(item.name)
        for item in pantry_items
    }

    # Get all recipes.
    recipe_result = await db.execute(
        select(Recipe).order_by(Recipe.title)
    )

    recipes = recipe_result.scalars().all()

    matches = []

    for recipe in recipes:
        ingredient_result = await db.execute(
            select(RecipeIngredient).where(
                RecipeIngredient.recipe_id == recipe.id
            )
        )

        ingredients = ingredient_result.scalars().all()

        if not ingredients:
            continue

        available = 0
        missing = []

        for ingredient in ingredients:
            ingredient_name = normalize_name(ingredient.name)

            if ingredient_name in pantry_names:
                available += 1
            else:
                missing.append(ingredient.name)

        total = len(ingredients)

        match_percentage = round(
            (available / total) * 100
        )

        matches.append(
            {
                "recipe_id": recipe.id,
                "title": recipe.title,
                "description": recipe.description,
                "cooking_time_minutes": recipe.cooking_time_minutes,
                "available_ingredients": available,
                "total_ingredients": total,
                "match_percentage": match_percentage,
                "missing_ingredients": missing,
            }
        )

    matches.sort(
        key=lambda recipe: recipe["match_percentage"],
        reverse=True,
    )

    return {
        "matches": matches
    }
