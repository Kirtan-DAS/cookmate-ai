from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from models import Recipe, RecipeIngredient
from schemas.recipe_ingredient import (
    RecipeIngredientCreate,
    RecipeIngredientResponse,
)

router = APIRouter(
    prefix="/api/recipes",
    tags=["Recipe Ingredients"],
)


@router.get(
    "/{recipe_id}/ingredients",
    response_model=list[RecipeIngredientResponse],
)
async def get_recipe_ingredients(
    recipe_id: int,
    db: AsyncSession = Depends(get_db),
):
    # Check that the recipe exists.
    result = await db.execute(
        select(Recipe).where(Recipe.id == recipe_id)
    )

    recipe = result.scalar_one_or_none()

    if recipe is None:
        raise HTTPException(
            status_code=404,
            detail="Recipe not found",
        )

    # Get all ingredients for this recipe.
    result = await db.execute(
        select(RecipeIngredient)
        .where(RecipeIngredient.recipe_id == recipe_id)
        .order_by(RecipeIngredient.name)
    )

    return result.scalars().all()


@router.post(
    "/{recipe_id}/ingredients",
    response_model=RecipeIngredientResponse,
)
async def add_recipe_ingredient(
    recipe_id: int,
    ingredient: RecipeIngredientCreate,
    db: AsyncSession = Depends(get_db),
):
    # Check that the recipe exists.
    result = await db.execute(
        select(Recipe).where(Recipe.id == recipe_id)
    )

    recipe = result.scalar_one_or_none()

    if recipe is None:
        raise HTTPException(
            status_code=404,
            detail="Recipe not found",
        )

    new_ingredient = RecipeIngredient(
        recipe_id=recipe_id,
        name=ingredient.name.strip(),
        quantity=ingredient.quantity,
        unit=ingredient.unit,
    )

    db.add(new_ingredient)

    await db.commit()
    await db.refresh(new_ingredient)

    return new_ingredient


@router.delete(
    "/{recipe_id}/ingredients/{ingredient_id}",
)
async def delete_recipe_ingredient(
    recipe_id: int,
    ingredient_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RecipeIngredient).where(
            RecipeIngredient.id == ingredient_id,
            RecipeIngredient.recipe_id == recipe_id,
        )
    )

    ingredient = result.scalar_one_or_none()

    if ingredient is None:
        raise HTTPException(
            status_code=404,
            detail="Recipe ingredient not found",
        )

    await db.delete(ingredient)
    await db.commit()

    return {
        "status": "success",
        "message": "Recipe ingredient deleted",
    }