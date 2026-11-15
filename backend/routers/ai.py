import json
import os
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from groq import AsyncGroq

from auth import get_current_user
from db import get_db
from models import PantryItem, Recipe, RecipeIngredient, RecipeStep, User

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

    prompt = f"""
Create exactly 5 distinct, practical recipes using this user's pantry.

PANTRY:
{pantry_text}

Return ONLY valid JSON in this structure:
{{
  "recommendations": [
    {{
      "name": "Recipe name",
      "description": "Short description",
      "uses": ["ingredients already in pantry"],
      "missing": ["ingredients the user needs to buy"],
      "why_it_matches": "Explain why this recipe suits the pantry",
      "cooking_time_minutes": 25,
      "ingredients": [
        {{"name": "Rice", "quantity": "1", "unit": "cup"}}
      ],
      "steps": [
        {{"instruction": "Wash the rice.", "timer_minutes": 2}}
      ]
    }}
  ]
}}

Rules:
- Exactly 5 recipes, if possible.
- Each recipe must have at least one cooking step.
- Include realistic ingredient quantities and units.
- Keep instructions beginner-friendly and numbered by array order.
- Do not invent ingredients as pantry items.
- Do not save anything or claim pantry quantities were changed.
"""

    try:
        completion = await get_ai_client().chat.completions.create(
            model=os.getenv("GROQ_MODEL", "openai/gpt-oss-20b"),
            messages=[
                {
                    "role": "system",
                    "content": "You generate accurate cooking recipes. Return valid JSON only."
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.5,
            max_completion_tokens=3500,
            response_format={"type": "json_object"},
        )

        content = completion.choices[0].message.content or "{}"
        parsed = json.loads(content)
        raw_recommendations = parsed.get("recommendations", [])

        recommendations = []

        for item in raw_recommendations[:5]:
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
            except Exception:
                continue

        return {"recommendations": recommendations}

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=502,
            detail="CookMate AI could not generate recommendations. Please try again."
        )


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

    except Exception:
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to save this recipe. Please try again."
        )
