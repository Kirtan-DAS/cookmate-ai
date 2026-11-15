
import os
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from groq import AsyncGroq

from auth import get_current_user

router = APIRouter(prefix="/api/ai", tags=["AI Assistant"])


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    recipe_title: str | None = None
    current_step: str | None = None
    history: list[ChatMessage] = Field(default_factory=list)


SYSTEM_PROMPT = """
You are CookMate, a friendly AI cooking assistant.

Help users understand recipes, cooking techniques,
ingredient substitutions and food safety.

Focus on the current recipe and cooking step.
Use simple language suitable for beginners.
Never claim to have changed the user's pantry or database.
"""


@router.post("/chat")
async def chat(
    request: ChatRequest,
    current_user=Depends(get_current_user),
):
    api_key = os.getenv("GROQ_API_KEY")
    model = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")

    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="AI service is not configured."
        )

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
        client = AsyncGroq(api_key=api_key)

        completion = await client.chat.completions.create(
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

    except Exception:
        raise HTTPException(
            status_code=502,
            detail="The AI service could not respond. Please try again."
        )
