from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class RecipeIngredientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    quantity: Optional[str] = None
    unit: Optional[str] = Field(default=None, max_length=50)


class RecipeIngredientResponse(RecipeIngredientCreate):
    id: int
    recipe_id: int

    model_config = ConfigDict(from_attributes=True)