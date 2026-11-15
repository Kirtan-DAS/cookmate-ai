from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class RecipeCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    cooking_time_minutes: Optional[int] = Field(
        default=None,
        ge=0,
    )


class RecipeUpdate(BaseModel):
    title: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=255,
    )

    description: Optional[str] = None

    cooking_time_minutes: Optional[int] = Field(
        default=None,
        ge=0,
    )


class RecipeResponse(RecipeCreate):
    id: int
    created_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )