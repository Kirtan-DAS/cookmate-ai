import os
from models.nutrition_profile import NutritionProfile
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from db import engine
from models import Base

from routers.pantry import router as pantry_router
from routers.inventory import router as inventory_router
from routers.recipes import router as recipes_router
from routers.recipe_ingredients import router as recipe_ingredients_router
from routers.recipe_matches import router as recipe_matches_router
from routers.recipe_steps import router as recipe_steps_router
from routers.ai import router as ai_router

app = FastAPI(
    title="CookMate API",
    description="Backend API for CookMate",
    version="0.4.0",
)


# CORS: allow local development and the deployed frontend URL
local_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

deployed_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("FRONTEND_URL", "").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys(local_origins + deployed_origins)),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Routers
app.include_router(pantry_router)
app.include_router(inventory_router)
app.include_router(recipe_matches_router)
app.include_router(recipes_router)
app.include_router(recipe_ingredients_router)
app.include_router(recipe_steps_router)
app.include_router(ai_router)


@app.on_event("startup")
async def startup():
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)


@app.get("/")
async def root():
    return {
        "application": "CookMate",
        "status": "running",
        "version": "0.4.0",
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "cookmate-backend",
    }


@app.get("/health/database")
async def database_health():
    try:
        async with engine.connect() as connection:
            result = await connection.execute(text("SELECT 1"))
            value = result.scalar()

        return {
            "status": "healthy",
            "database": "connected",
            "test_query": value,
        }

    except Exception as exc:
        return {
            "status": "unhealthy",
            "database": "connection_failed",
            "error": str(exc),
        }
