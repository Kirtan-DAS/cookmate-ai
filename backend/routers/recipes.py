from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from models import Recipe, RecipeIngredient
from schemas.recipe import RecipeCreate, RecipeResponse, RecipeUpdate

router = APIRouter(prefix="/api/recipes", tags=["Recipes"])


@router.get("/", response_model=list[RecipeResponse])
async def get_recipes(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Recipe).order_by(Recipe.title)
    )
    return result.scalars().all()


@router.get("/{recipe_id}/details")
async def get_recipe_details(
    recipe_id: int,
    db: AsyncSession = Depends(get_db),
):
    # Get recipe
    result = await db.execute(
        select(Recipe).where(Recipe.id == recipe_id)
    )

    recipe = result.scalar_one_or_none()

    if recipe is None:
        raise HTTPException(
            status_code=404,
            detail="Recipe not found",
        )

    # Get ingredients
    ingredient_result = await db.execute(
        select(RecipeIngredient)
        .where(RecipeIngredient.recipe_id == recipe_id)
        .order_by(RecipeIngredient.name)
    )

    ingredients = ingredient_result.scalars().all()

    return {
        "id": recipe.id,
        "title": recipe.title,
        "description": recipe.description,
        "cooking_time_minutes": recipe.cooking_time_minutes,
        "created_at": recipe.created_at,
        "ingredients": [
            {
                "id": ingredient.id,
                "name": ingredient.name,
                "quantity": ingredient.quantity,
                "unit": ingredient.unit,
            }
            for ingredient in ingredients
        ],
    }


@router.get("/{recipe_id}", response_model=RecipeResponse)
async def get_recipe(
    recipe_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Recipe).where(Recipe.id == recipe_id)
    )

    recipe = result.scalar_one_or_none()

    if recipe is None:
        raise HTTPException(
            status_code=404,
            detail="Recipe not found",
        )

    return recipe


@router.post("/", response_model=RecipeResponse)
async def create_recipe(
    recipe: RecipeCreate,
    db: AsyncSession = Depends(get_db),
):
    new_recipe = Recipe(
        title=recipe.title.strip(),
        description=recipe.description,
        cooking_time_minutes=recipe.cooking_time_minutes,
    )

    db.add(new_recipe)

    await db.commit()
    await db.refresh(new_recipe)

    return new_recipe


@router.patch("/{recipe_id}", response_model=RecipeResponse)
async def update_recipe(
    recipe_id: int,
    recipe: RecipeUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Recipe).where(Recipe.id == recipe_id)
    )

    existing_recipe = result.scalar_one_or_none()

    if existing_recipe is None:
        raise HTTPException(
            status_code=404,
            detail="Recipe not found",
        )

    update_data = recipe.model_dump(exclude_unset=True)

    if "title" in update_data and update_data["title"] is not None:
        update_data["title"] = update_data["title"].strip()

        if not update_data["title"]:
            raise HTTPException(
                status_code=400,
                detail="Recipe title cannot be empty",
            )

    for field, value in update_data.items():
        setattr(existing_recipe, field, value)

    await db.commit()
    await db.refresh(existing_recipe)

    return existing_recipe


@router.delete("/{recipe_id}")
async def delete_recipe(
    recipe_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Recipe).where(Recipe.id == recipe_id)
    )

    recipe = result.scalar_one_or_none()

    if recipe is None:
        raise HTTPException(
            status_code=404,
            detail="Recipe not found",
        )

    await db.delete(recipe)

    await db.commit()

    return {
        "status": "success",
        "message": "Recipe deleted",
    }