from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import (
    DateTime, ForeignKey, Float, Integer,
    String, JSON, func
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from models.database import Base


class NutritionProfile(Base):
    __tablename__ = "nutrition_profiles"

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    age: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height_cm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    weight_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    activity_level: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True
    )

    diet_type: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True
    )

    food_preferences: Mapped[list] = mapped_column(
        JSON, default=list, nullable=False
    )

    dietary_restrictions: Mapped[list] = mapped_column(
        JSON, default=list, nullable=False
    )

    nutrition_goals: Mapped[list] = mapped_column(
        JSON, default=list, nullable=False
    )

    daily_calorie_target: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )

    daily_protein_target_g: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True
    )

    daily_fiber_target_g: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
