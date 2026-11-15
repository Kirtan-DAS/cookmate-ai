from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class PantryStockAdjustment(BaseModel):
    amount: Decimal = Field(gt=0)
    unit: str = Field(min_length=1, max_length=50)
    operation: Literal["add", "consume"]

    @field_validator("unit")
    @classmethod
    def clean_unit(cls, value: str) -> str:
        value = value.strip().lower()

        if not value:
            raise ValueError("Unit cannot be empty")

        return value
