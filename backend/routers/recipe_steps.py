from decimal import Decimal, InvalidOperation
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_db
from routers.pantry import normalize_name
from models import PantryItem, Recipe, RecipeIngredient, RecipeStep, User
from schemas.recipe_step import RecipeStepCreate, RecipeStepResponse


router = APIRouter(
    prefix="/api/recipes",
    tags=["Recipe Steps"],
)


# ---------------------------------------------------------
# Quantity helpers
# ---------------------------------------------------------

def parse_quantity(value: str | None) -> Decimal | None:
    if not value:
        return None

    cleaned = value.strip().lower()

    fraction_map = {
        "1/4": Decimal("0.25"),
        "1/2": Decimal("0.5"),
        "3/4": Decimal("0.75"),
        "1/3": Decimal("0.33"),
        "2/3": Decimal("0.67"),
        "1/8": Decimal("0.125"),
    }

    if cleaned in fraction_map:
        return fraction_map[cleaned]

    match = re.match(r"^(\d+)\s+(\d+/\d+)$", cleaned)

    if match:
        whole = Decimal(match.group(1))
        frac_str = match.group(2)

        if frac_str in fraction_map:
            return whole + fraction_map[frac_str]

    try:
        return Decimal(cleaned)

    except (InvalidOperation, ValueError):
        return None


def format_quantity(val: Decimal) -> str:
    if val % 1 == 0:
        return str(int(val))

    return str(val.normalize())


# ---------------------------------------------------------
# GET RECIPE STEPS
# ---------------------------------------------------------

@router.get(
    "/{recipe_id}/steps",
    response_model=list[RecipeStepResponse],
)
async def get_recipe_steps(
    recipe_id: int,
    db: AsyncSession = Depends(get_db),
):
    recipe_result = await db.execute(
        select(Recipe).where(Recipe.id == recipe_id)
    )

    recipe = recipe_result.scalar_one_or_none()

    if recipe is None:
        raise HTTPException(
            status_code=404,
            detail="Recipe not found",
        )

    result = await db.execute(
        select(RecipeStep)
        .where(RecipeStep.recipe_id == recipe_id)
        .order_by(RecipeStep.step_number)
    )

    return result.scalars().all()


# ---------------------------------------------------------
# CREATE RECIPE STEP
# ---------------------------------------------------------

@router.post(
    "/{recipe_id}/steps",
    response_model=RecipeStepResponse,
)
async def create_recipe_step(
    recipe_id: int,
    step: RecipeStepCreate,
    db: AsyncSession = Depends(get_db),
):
    recipe_result = await db.execute(
        select(Recipe).where(Recipe.id == recipe_id)
    )

    recipe = recipe_result.scalar_one_or_none()

    if recipe is None:
        raise HTTPException(
            status_code=404,
            detail="Recipe not found",
        )

    new_step = RecipeStep(
        recipe_id=recipe_id,
        step_number=step.step_number,
        instruction=step.instruction.strip(),
        timer_minutes=step.timer_minutes,
    )

    db.add(new_step)

    await db.commit()
    await db.refresh(new_step)

    return new_step


# ---------------------------------------------------------
# DELETE RECIPE STEP
# ---------------------------------------------------------

@router.delete(
    "/{recipe_id}/steps/{step_id}"
)
async def delete_recipe_step(
    recipe_id: int,
    step_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RecipeStep).where(
            RecipeStep.id == step_id,
            RecipeStep.recipe_id == recipe_id,
        )
    )

    step = result.scalar_one_or_none()

    if step is None:
        raise HTTPException(
            status_code=404,
            detail="Recipe step not found",
        )

    await db.delete(step)

    await db.commit()

    return {
        "status": "success",
        "message": "Recipe step deleted",
    }


# ---------------------------------------------------------
# COMPLETE RECIPE + DEDUCT PANTRY
# ---------------------------------------------------------

@router.post(
    "/{recipe_id}/complete"
)
async def complete_recipe(
    recipe_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # -----------------------------------------------------
    # Find recipe
    # -----------------------------------------------------

    recipe_result = await db.execute(
        select(Recipe).where(Recipe.id == recipe_id)
    )

    recipe = recipe_result.scalar_one_or_none()

    if recipe is None:
        raise HTTPException(
            status_code=404,
            detail="Recipe not found",
        )

    # -----------------------------------------------------
    # Get recipe ingredients
    # -----------------------------------------------------

    ingredients_result = await db.execute(
        select(RecipeIngredient).where(
            RecipeIngredient.recipe_id == recipe_id
        )
    )

    recipe_ingredients = ingredients_result.scalars().all()

    # -----------------------------------------------------
    # Get user's pantry
    # -----------------------------------------------------

    pantry_result = await db.execute(
        select(PantryItem).where(
            PantryItem.user_id == current_user.id
        )
    )

    pantry_items = pantry_result.scalars().all()

    # -----------------------------------------------------
    # Result containers
    # -----------------------------------------------------

    deducted_items = []
    removed_items = []
    skipped_items = []

    # -----------------------------------------------------
    # Process every recipe ingredient
    # -----------------------------------------------------

    for r_ing in recipe_ingredients:

        # IMPORTANT:
        # Use the same ingredient normalization as Pantry.
        #
        # Example:
        # Onion  == onions
        # Tomato == tomatoes
        # Egg    == eggs
        #
        match = next(
            (
                p
                for p in pantry_items
                if normalize_name(p.name)
                == normalize_name(r_ing.name)
            ),
            None,
        )

        # -------------------------------------------------
        # Ingredient not found
        # -------------------------------------------------

        if match is None:
            skipped_items.append(
                {
                    "ingredient": r_ing.name,
                    "reason": "Ingredient not found in pantry",
                }
            )

            continue

        # -------------------------------------------------
        # Parse quantities
        # -------------------------------------------------

        r_qty = parse_quantity(r_ing.quantity)
        p_qty = parse_quantity(match.quantity)

        if r_qty is None:
            skipped_items.append(
                {
                    "ingredient": r_ing.name,
                    "reason": "Recipe quantity could not be understood",
                    "recipe_quantity": r_ing.quantity,
                }
            )

            continue

        if p_qty is None:
            skipped_items.append(
                {
                    "ingredient": match.name,
                    "reason": "Pantry quantity could not be understood",
                    "pantry_quantity": match.quantity,
                }
            )

            continue

        # -------------------------------------------------
        # Normalize units
        # -------------------------------------------------

        recipe_unit = (
            r_ing.unit.strip().lower()
            if r_ing.unit
            else None
        )

        pantry_unit = (
            match.unit.strip().lower()
            if match.unit
            else None
        )

        unit_aliases = {
            "piece": "piece",
            "pieces": "piece",
            "pc": "piece",
            "pcs": "piece",

            "cup": "cup",
            "cups": "cup",

            "tbsp": "tbsp",
            "tablespoon": "tbsp",
            "tablespoons": "tbsp",

            "tsp": "tsp",
            "teaspoon": "tsp",
            "teaspoons": "tsp",

            "kg": "kg",
            "kilogram": "kg",
            "kilograms": "kg",

            "g": "g",
            "gram": "g",
            "grams": "g",

            "l": "l",
            "liter": "l",
            "liters": "l",
            "litre": "l",
            "litres": "l",

            "ml": "ml",
            "milliliter": "ml",
            "milliliters": "ml",
            "millilitre": "ml",
            "millilitres": "ml",
        }

        if recipe_unit and pantry_unit:

            normalized_recipe_unit = unit_aliases.get(
                recipe_unit,
                recipe_unit,
            )

            normalized_pantry_unit = unit_aliases.get(
                pantry_unit,
                pantry_unit,
            )

            # -------------------------------------------------
            # Units don't match
            # -------------------------------------------------

            if normalized_recipe_unit != normalized_pantry_unit:

                skipped_items.append(
                    {
                        "ingredient": match.name,
                        "reason": (
                            f"Unit mismatch: pantry has "
                            f"{match.unit}, recipe needs "
                            f"{r_ing.unit}"
                        ),
                    }
                )

                continue

        # -------------------------------------------------
        # Not enough quantity
        # -------------------------------------------------

        if p_qty < r_qty:

            skipped_items.append(
                {
                    "ingredient": match.name,
                    "reason": "Not enough quantity in pantry",
                    "available": match.quantity,
                    "required": r_ing.quantity,
                    "unit": match.unit,
                }
            )

            continue

        # -------------------------------------------------
        # Exact quantity → remove pantry item
        # -------------------------------------------------

        if p_qty == r_qty:

            removed_items.append(
                {
                    "ingredient": match.name,
                    "used": r_ing.quantity,
                    "unit": match.unit,
                }
            )

            await db.delete(match)

            continue

        # -------------------------------------------------
        # Partial quantity → subtract
        # -------------------------------------------------

        new_qty = p_qty - r_qty

        match.quantity = format_quantity(new_qty)

        deducted_items.append(
            {
                "ingredient": match.name,
                "used": r_ing.quantity,
                "remaining": match.quantity,
                "unit": match.unit,
            }
        )

    # -----------------------------------------------------
    # Save all pantry changes
    # -----------------------------------------------------

    await db.commit()

    # -----------------------------------------------------
    # Return result
    # -----------------------------------------------------

    return {
        "status": "success",
        "message": "Recipe marked as completed and pantry updated",
        "recipe_id": recipe_id,
        "recipe": recipe.title,
        "deducted_items": deducted_items,
        "removed_items": removed_items,
        "skipped_items": skipped_items,
    }