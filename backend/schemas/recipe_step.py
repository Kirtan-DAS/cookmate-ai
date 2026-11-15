from pydantic import BaseModel, ConfigDict, Field
from typing import Optional


class RecipeStepCreate(BaseModel):
    step_number: int = Field(ge=1)
    instruction: str = Field(min_length=1)
    timer_minutes: Optional[int] = Field(default=None, ge=0)


class RecipeStepResponse(RecipeStepCreate):
    id: int
    recipe_id: int

    model_config = ConfigDict(from_attributes=True)