import json
import os
import logging  # 1. Import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from groq import AsyncGroq

from auth import get_current_user
from db import get_db
from models import (
    PantryItem,
    Recipe,
    RecipeIngredient,
    RecipeStep,
    NutritionProfile,
    User,
)

router = APIRouter(prefix="/api/ai", tags=["AI Assistant"])


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    recipe_title: str | None = None
    current_step: str | None = None
    history: list[ChatMessage] = Field(default_factory=list)


class GeneratedIngredient(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    quantity: str | None = None
    unit: str | None = Field(default=None, max_length=50)

    @field_validator("quantity", mode="before")
    @classmethod
    def normalize_quantity(cls, value):
        if value is None:
            return None
        if isinstance(value, bool):
            raise ValueError("Quantity must not be boolean")
        if isinstance(value, (int, float)):
            return str(value)
        return value


class GeneratedStep(BaseModel):
    instruction: str = Field(min_length=1)
    timer_minutes: int | None = Field(default=None, ge=0)


class SaveRecommendationRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=4000)
    cooking_time_minutes: int | None = Field(default=None, ge=0)
    ingredients: list[GeneratedIngredient] = Field(min_length=1, max_length=40)
    steps: list[GeneratedStep] = Field(min_length=1, max_length=30)


SYSTEM_PROMPT = """
You are CookMate, a friendly AI cooking assistant.
Help users understand recipes, cooking techniques,
ingredient substitutions and food safety.
Focus on the current recipe and cooking step.
Use simple language suitable for beginners.
Never claim to have changed the user's pantry or database.
"""


def get_ai_client():
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="AI service is not configured."
        )
    return AsyncGroq(api_key=api_key)


@router.post("/chat")
async def chat(
    request: ChatRequest,
    current_user=Depends(get_current_user),
):
    model = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    if request.recipe_title:
        messages.append({
            "role": "system",
            "content": f"Current recipe: {request.recipe_title}"
        })

    if request.current_step:
        messages.append({
            "role": "system",
            "content": f"Current cooking step: {request.current_step}"
        })

    for item in request.history[-12:]:
        messages.append({
            "role": item.role,
            "content": item.content
        })

    messages.append({
        "role": "user",
        "content": request.message
    })

    try:
        completion = await get_ai_client().chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.6,
            max_completion_tokens=600,
        )
        answer = completion.choices[0].message.content
        return {
            "reply": answer or "Sorry, I couldn't generate a response.",
            "recipe_title": request.recipe_title,
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=502,
            detail="The AI service could not respond. Please try again."
        )


@router.get("/recommendations")
async def get_recommendations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pantry_result = await db.execute(
        select(PantryItem).where(
            PantryItem.user_id == current_user.id
        )
    )
    pantry = pantry_result.scalars().all()

    if not pantry:
        return {"recommendations": []}

    pantry_text = "\n".join(
        f"- {item.name}: {item.quantity or 'quantity unknown'} "
        f"{item.unit or ''}"
        for item in pantry
    )

    # Load the signed-in user's saved nutrition profile.
    profile = await db.get(NutritionProfile, current_user.id)
    if profile:
        diet_type = profile.diet_type or "Not specified"
        activity_level = profile.activity_level or "Not specified"
        goals = ", ".join(profile.nutrition_goals or []) or "Balanced meals"
        preferences = ", ".join(profile.food_preferences or []) or "None"
        restrictions = ", ".join(profile.dietary_restrictions or []) or "None"
        nutrition_context = f"""
USER NUTRITION PROFILE:
Diet type: {diet_type}
Activity level: {activity_level}
Nutrition goals: {goals}
Food preferences: {preferences}
Dietary restrictions: {restrictions}
Daily targets (optional, for context):
Calories: {profile.daily_calorie_target or "Not set"} kcal
Protein: {profile.daily_protein_target_g or "Not set"} g
Fiber: {profile.daily_fiber_target_g or "Not set"} g
"""
    else:
        nutrition_context = """
USER NUTRITION PROFILE:
No profile configured. Recommend practical, balanced meals.
"""

    prompt = f"""
You are CookMate AI. Generate exactly 2 practical recipes.

USER PROFILE:
{nutrition_context}

AVAILABLE PANTRY:
{pantry_text}

Return one valid JSON object with a "recommendations" array
containing exactly 2 recipes.

Each recipe must have these fields:
- name: short recipe title
- description: maximum 20 words
- uses: array of pantry ingredient names
- missing: array of additional ingredient names
- why_it_matches: maximum 20 words
- cooking_time_minutes: integer
- ingredients: array of objects with name, quantity, unit
- steps: array of objects with instruction, timer_minutes

Requirements:
- Maximum 8 ingredients per recipe.
- Maximum 5 short cooking steps per recipe.
- Prefer ingredients already in the pantry.
- Respect all dietary restrictions.
- Consider nutrition goals and food preferences.
- Do not invent nutritional values.
- Do not claim pantry quantities were changed.
- Use realistic cooking instructions and quantities.
- Return JSON only, without Markdown.
"""

    try:
        try:
            completion = await get_ai_client().chat.completions.create(
                model=os.getenv("GROQ_MODEL", "openai/gpt-oss-20b"),
                messages=[
                    {
                        "role": "system",
                        "content": "Generate cooking recipes. Return one valid JSON object only."
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.1,
                max_completion_tokens=4096,
                response_format={"type": "json_object"},
            )
        except Exception as first_error:
            error_text = str(first_error)

            if "json_validate_failed" not in error_text:
                raise

            print("CookMate AI: JSON validation failed; retrying.")

            completion = await get_ai_client().chat.completions.create(
                model=os.getenv("GROQ_MODEL", "openai/gpt-oss-20b"),
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Return valid JSON only. "
                            "Use the structure requested by the user. "
                            "Keep recipe descriptions and cooking steps concise."
                        )
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0,
                max_completion_tokens=4096,
            )

        content = completion.choices[0].message.content or "{}"
        parsed = json.loads(content)
        raw_recommendations = parsed.get("recommendations", [])
        print("CookMate AI generated:", len(raw_recommendations), "raw recommendations")

        recommendations = []

        for item in raw_recommendations[:2]:
            try:
                ingredients = [
                    GeneratedIngredient.model_validate(value).model_dump()
                    for value in item.get("ingredients", [])
                ]
                steps = [
                    GeneratedStep.model_validate(value).model_dump()
                    for value in item.get("steps", [])
                ]

                if not ingredients or not steps:
                    continue

                recommendations.append({
                    "name": str(item.get("name", "Untitled recipe"))[:255],
                    "description": str(item.get("description", "")),
                    "uses": item.get("uses", []),
                    "missing": item.get("missing", []),
                    "why_it_matches": str(item.get("why_it_matches", "")),
                    "cooking_time_minutes": item.get("cooking_time_minutes"),
                    "ingredients": ingredients,
                    "steps": steps,
                    "recipe_id": None,
                    "recipe_source": "ai_generated",
                })
            except Exception as exc:
                print(f"CookMate recommendation validation error: {exc}")
                continue

        return {"recommendations": recommendations}

    except HTTPException:
        raise
    except Exception as exc:
        logging.getLogger("cookmate.ai").exception(
            "CookMate AI recommendation generation failed"
        )
        raise HTTPException(
            status_code=502,
            detail="CookMate AI could not generate recommendations. Check backend logs."
        ) from exc


@router.post("/recommendations/save")
async def save_recommendation(
    request: SaveRecommendationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Only this explicitly selected recommendation is saved.
    recipe = Recipe(
        title=request.name.strip(),
        description=request.description,
        cooking_time_minutes=request.cooking_time_minutes,
    )

    try:
        db.add(recipe)
        await db.flush()

        for ingredient in request.ingredients:
            db.add(
                RecipeIngredient(
                    recipe_id=recipe.id,
                    name=ingredient.name.strip(),
                    quantity=ingredient.quantity,
                    unit=ingredient.unit,
                )
            )

        for number, step in enumerate(request.steps, start=1):
            db.add(
                RecipeStep(
                    recipe_id=recipe.id,
                    step_number=number,
                    instruction=step.instruction.strip(),
                    timer_minutes=step.timer_minutes,
                )
            )

        await db.commit()
        await db.refresh(recipe)

        return {
            "message": "Recipe saved successfully.",
            "recipe_id": recipe.id,
            "recipe_source": "database",
        }

    except Exception as exc:
        await db.rollback()
        # 2. Log the actual exception in the terminal for debugging
        logging.getLogger("cookmate").exception("Error saving recommendation:")
        raise HTTPException(
            status_code=500,
            detail="Unable to save this recipe. Please try again."
        )