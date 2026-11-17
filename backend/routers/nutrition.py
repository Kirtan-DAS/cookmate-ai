from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_db
from models import User, NutritionProfile

router = APIRouter(
    prefix="/api/nutrition",
    tags=["Nutrition Profile"]
)


class NutritionProfileInput(BaseModel):
    age: Optional[int] = Field(default=None, ge=1, le=120)
    height_cm: Optional[float] = Field(default=None, gt=0, le=300)
    weight_kg: Optional[float] = Field(default=None, gt=0, le=500)

    activity_level: Optional[str] = Field(default=None, max_length=50)
    diet_type: Optional[str] = Field(default=None, max_length=50)

    food_preferences: list[str] = Field(default_factory=list)
    dietary_restrictions: list[str] = Field(default_factory=list)
    nutrition_goals: list[str] = Field(default_factory=list)

    daily_calorie_target: Optional[int] = Field(default=None, gt=0)
    daily_protein_target_g: Optional[float] = Field(default=None, gt=0)
    daily_fiber_target_g: Optional[float] = Field(default=None, gt=0)


class NutritionProfileResponse(NutritionProfileInput):
    model_config = ConfigDict(from_attributes=True)

    created_at: datetime
    updated_at: datetime


@router.get("/profile", response_model=NutritionProfileResponse)
async def get_nutrition_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile = await db.get(NutritionProfile, current_user.id)

    if profile is None:
        raise HTTPException(
            status_code=404,
            detail="Nutrition profile not created yet"
        )

    return profile


@router.put("/profile", response_model=NutritionProfileResponse)
async def save_nutrition_profile(
    payload: NutritionProfileInput,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile = await db.get(NutritionProfile, current_user.id)

    values = payload.model_dump()

    if profile is None:
        profile = NutritionProfile(
            user_id=current_user.id,
            **values
        )
        db.add(profile)
    else:
        for field, value in values.items():
            setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)

    return profile
