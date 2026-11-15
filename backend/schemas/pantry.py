from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PantryItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)

    quantity: Optional[str] = Field(
        default=None,
        max_length=100,
    )

    unit: Optional[str] = Field(
        default=None,
        max_length=50,
    )

    category: Optional[str] = Field(
        default=None,
        max_length=100,
    )

    purchase_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None

    expiry_source: Optional[str] = Field(
        default=None,
        max_length=30,
    )

    storage_location: Optional[str] = Field(
        default=None,
        max_length=100,
    )

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("Ingredient name cannot be empty")

        return value


class PantryItemUpdate(BaseModel):
    name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=150,
    )

    quantity: Optional[str] = Field(
        default=None,
        max_length=100,
    )

    unit: Optional[str] = Field(
        default=None,
        max_length=50,
    )

    category: Optional[str] = Field(
        default=None,
        max_length=100,
    )

    purchase_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None

    expiry_source: Optional[str] = Field(
        default=None,
        max_length=30,
    )

    storage_location: Optional[str] = Field(
        default=None,
        max_length=100,
    )

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None

        value = value.strip()

        if not value:
            raise ValueError("Ingredient name cannot be empty")

        return value


class PantryItemResponse(PantryItemCreate):
    id: int
    user_id: UUID
    ingredient_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )