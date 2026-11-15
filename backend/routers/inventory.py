from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_db
from models import PantryItem, User
from schemas.inventory import PantryStockAdjustment
from schemas.pantry import PantryItemResponse

router = APIRouter(prefix="/api/pantry", tags=["Pantry Inventory"])

UNIT_GROUPS = {
    "mass": {
        "g": Decimal("1"),
        "gram": Decimal("1"),
        "grams": Decimal("1"),
        "kg": Decimal("1000"),
        "kilogram": Decimal("1000"),
        "kilograms": Decimal("1000"),
        "mg": Decimal("0.001"),
    },
    "volume": {
        "ml": Decimal("1"),
        "milliliter": Decimal("1"),
        "milliliters": Decimal("1"),
        "millilitre": Decimal("1"),
        "millilitres": Decimal("1"),
        "l": Decimal("1000"),
        "liter": Decimal("1000"),
        "liters": Decimal("1000"),
        "litre": Decimal("1000"),
        "litres": Decimal("1000"),
    },
    "count": {
        "piece": Decimal("1"),
        "pieces": Decimal("1"),
        "pc": Decimal("1"),
        "pcs": Decimal("1"),
        "unit": Decimal("1"),
        "units": Decimal("1"),
        "egg": Decimal("1"),
        "eggs": Decimal("1"),
    },
}


def unit_info(unit: str):
    normalized = unit.strip().lower()

    for group, units in UNIT_GROUPS.items():
        if normalized in units:
            return group, units[normalized]

    return f"custom:{normalized}", Decimal("1")


def decimal_text(value: Decimal) -> str:
    value = value.normalize()

    if value == value.to_integral_value():
        return str(int(value))

    return format(value, "f").rstrip("0").rstrip(".")


@router.post("/{item_id}/stock", response_model=PantryItemResponse)
async def adjust_pantry_stock(
    item_id: int,
    adjustment: PantryStockAdjustment,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PantryItem)
        .where(
            PantryItem.id == item_id,
            PantryItem.user_id == current_user.id,
        )
        .with_for_update()
    )

    pantry_item = result.scalar_one_or_none()

    if pantry_item is None:
        raise HTTPException(status_code=404, detail="Pantry item not found")

    incoming_unit = adjustment.unit.strip().lower()
    incoming_group, incoming_factor = unit_info(incoming_unit)

    stored_unit = (
        pantry_item.unit.strip().lower()
        if pantry_item.unit
        else None
    )

    if stored_unit:
        stored_group, stored_factor = unit_info(stored_unit)

        if incoming_group != stored_group:
            raise HTTPException(
                status_code=400,
                detail=f"Incompatible units: {incoming_unit} and {stored_unit}.",
            )
    else:
        stored_unit = incoming_unit
        stored_group, stored_factor = unit_info(stored_unit)

    if adjustment.operation == "consume" and pantry_item.quantity is None:
        raise HTTPException(
            status_code=400,
            detail="Quantity is missing. Please update the pantry quantity first.",
        )

    if pantry_item.quantity is None:
        current_quantity = Decimal("0")
    else:
        try:
            current_quantity = Decimal(str(pantry_item.quantity).strip())
        except (InvalidOperation, ValueError):
            raise HTTPException(
                status_code=400,
                detail="Existing quantity is not numeric. Please correct it first.",
            )

    if not current_quantity.is_finite() or current_quantity < 0:
        raise HTTPException(
            status_code=400,
            detail="Existing pantry quantity is invalid.",
        )

    converted_amount = (
        adjustment.amount * incoming_factor / stored_factor
    )

    if adjustment.operation == "add":
        new_quantity = current_quantity + converted_amount
    else:
        if converted_amount > current_quantity:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Insufficient stock. Available: "
                    f"{decimal_text(current_quantity)} {stored_unit}."
                ),
            )

        new_quantity = current_quantity - converted_amount

    pantry_item.quantity = decimal_text(new_quantity)
    pantry_item.unit = stored_unit

    await db.commit()
    await db.refresh(pantry_item)

    return pantry_item
