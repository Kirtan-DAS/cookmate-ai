from decimal import Decimal, InvalidOperation
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_db
from models import PantryItem, User
from schemas.pantry import (
    PantryItemCreate,
    PantryItemResponse,
    PantryItemUpdate,
)

router = APIRouter(prefix="/api/pantry", tags=["Pantry"])


# ---------------------------------------------------------
# Ingredient normalization
# ---------------------------------------------------------

def normalize_name(name: str) -> str:
    value = re.sub(r"\s+", " ", name.strip()).casefold()

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
        "vegetables": "vegetable",
    }

    return plural_map.get(value, value)


def display_name(name: str) -> str:
    """
    Keep a clean human-readable name in the database.
    """
    return " ".join(word.capitalize() for word in name.strip().split())


# ---------------------------------------------------------
# Quantity helpers
# ---------------------------------------------------------

def parse_quantity(value: str | None) -> Decimal | None:
    if value is None:
        return None

    value = str(value).strip()

    if not value:
        return None

    try:
        return Decimal(value)
    except (InvalidOperation, ValueError):
        return None


def format_quantity(value: Decimal) -> str:
    """
    Avoid ugly Decimal formatting.

    25.000 -> 25
    2.500 -> 2.5
    """
    normalized = value.normalize()

    if normalized == normalized.to_integral():
        return str(int(normalized))

    return format(normalized, "f").rstrip("0").rstrip(".")


# ---------------------------------------------------------
# GET
# ---------------------------------------------------------

@router.get("/", response_model=list[PantryItemResponse])
async def get_pantry(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PantryItem)
        .where(PantryItem.user_id == current_user.id)
        .order_by(PantryItem.name)
    )

    return result.scalars().all()


# ---------------------------------------------------------
# POST
# ---------------------------------------------------------

@router.post("/", response_model=PantryItemResponse)
async def create_pantry_item(
    item: PantryItemCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    raw_name = item.name.strip()

    if not raw_name:
        raise HTTPException(
            status_code=400,
            detail="Ingredient name cannot be empty",
        )

    canonical = normalize_name(raw_name)
    clean_name = display_name(canonical)

    quantity = parse_quantity(item.quantity)
    incoming_unit = item.unit.strip().casefold() if item.unit else None

    # Find an existing item belonging to this user.
    result = await db.execute(
        select(PantryItem).where(
            PantryItem.user_id == current_user.id
        )
    )

    existing_items = result.scalars().all()

    matching_item = None

    for existing in existing_items:
        existing_canonical = normalize_name(existing.name)

        existing_unit = (
            existing.unit.strip().casefold()
            if existing.unit
            else None
        )

        # Merge only when both ingredient AND unit match.
        if (
            existing_canonical == canonical
            and existing_unit == incoming_unit
        ):
            matching_item = existing
            break

    if matching_item:
        existing_quantity = parse_quantity(matching_item.quantity)

        if quantity is not None and existing_quantity is not None:
            matching_item.quantity = format_quantity(
                existing_quantity + quantity
            )

        elif quantity is not None and existing_quantity is None:
            matching_item.quantity = item.quantity

        # Keep the canonical display name.
        matching_item.name = clean_name

        # Update optional metadata when supplied.
        if item.category is not None:
            matching_item.category = item.category

        if item.purchase_date is not None:
            matching_item.purchase_date = item.purchase_date

        if item.expiry_date is not None:
            matching_item.expiry_date = item.expiry_date

        if item.expiry_source is not None:
            matching_item.expiry_source = item.expiry_source

        if item.storage_location is not None:
            matching_item.storage_location = item.storage_location

        await db.commit()
        await db.refresh(matching_item)

        return matching_item

    # No matching item → create a new pantry record.
    pantry_item = PantryItem(
        user_id=current_user.id,
        name=clean_name,
        quantity=item.quantity,
        unit=item.unit,
        category=item.category,
        purchase_date=item.purchase_date,
        expiry_date=item.expiry_date,
        expiry_source=item.expiry_source,
        storage_location=item.storage_location,
    )

    db.add(pantry_item)

    await db.commit()
    await db.refresh(pantry_item)

    return pantry_item


# ---------------------------------------------------------
# PATCH
# ---------------------------------------------------------

@router.patch("/{item_id}", response_model=PantryItemResponse)
async def update_pantry_item(
    item_id: int,
    item: PantryItemUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PantryItem).where(
            PantryItem.id == item_id,
            PantryItem.user_id == current_user.id,
        )
    )

    pantry_item = result.scalar_one_or_none()

    if pantry_item is None:
        raise HTTPException(
            status_code=404,
            detail="Pantry item not found",
        )

    update_data = item.model_dump(exclude_unset=True)

    for field, value in update_data.items():

        if field == "name" and value is not None:
            value = value.strip()

            if not value:
                raise HTTPException(
                    status_code=400,
                    detail="Ingredient name cannot be empty",
                )

            value = display_name(normalize_name(value))

        if field == "unit" and value is not None:
            value = value.strip()

        setattr(pantry_item, field, value)

    await db.commit()
    await db.refresh(pantry_item)

    return pantry_item


# ---------------------------------------------------------
# DELETE
# ---------------------------------------------------------

@router.delete("/{item_id}")
async def delete_pantry_item(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PantryItem).where(
            PantryItem.id == item_id,
            PantryItem.user_id == current_user.id,
        )
    )

    pantry_item = result.scalar_one_or_none()

    if pantry_item is None:
        raise HTTPException(
            status_code=404,
            detail="Pantry item not found",
        )

    await db.delete(pantry_item)
    await db.commit()

    return {
        "status": "success",
        "message": "Pantry item deleted",
    }