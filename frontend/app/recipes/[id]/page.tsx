"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

type Ingredient = {
  id: number;
  name: string;
  quantity: string | null;
  unit: string | null;
};

type RecipeDetails = {
  id: number;
  title: string;
  description: string | null;
  cooking_time_minutes: number | null;
  ingredients: Ingredient[];
};

export default function RecipeDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [recipe, setRecipe] = useState<RecipeDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadRecipe() {
      try {
        const { id } = await params;

        const response = await fetch(
          `${API_URL}/api/recipes/${id}/details`
        );

        if (!response.ok) {
          throw new Error("Failed to load recipe.");
        }

        const data = await response.json();

        setRecipe(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong."
        );
      } finally {
        setLoading(false);
      }
    }

    loadRecipe();
  }, [params]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 p-10">
        <div className="mx-auto max-w-4xl">
          <p className="text-gray-600">Loading recipe...</p>
        </div>
      </main>
    );
  }

  if (error || !recipe) {
    return (
      <main className="min-h-screen bg-gray-50 p-10">
        <div className="mx-auto max-w-4xl">
          <p className="text-red-600">
            {error || "Recipe not found."}
          </p>

          <Link
            href="/recipes"
            className="mt-4 inline-block text-blue-600 hover:underline"
          >
            ← Back to recipes
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto max-w-4xl">

        <Link
          href="/recipes"
          className="mb-6 inline-block text-sm text-blue-600 hover:underline"
        >
          ← Back to recipes
        </Link>

        <section className="rounded-2xl bg-white p-8 shadow-sm">

          <h1 className="text-4xl font-bold text-gray-900">
            {recipe.title}
          </h1>

          {recipe.cooking_time_minutes !== null && (
            <p className="mt-3 text-gray-600">
              ⏱️ {recipe.cooking_time_minutes} min
            </p>
          )}

          {recipe.description && (
            <p className="mt-4 text-gray-700">
              {recipe.description}
            </p>
          )}

          <div className="mt-8">

            <h2 className="mb-4 text-2xl font-semibold text-gray-900">
              🥕 Ingredients
            </h2>

            <div className="space-y-3">
              {recipe.ingredients.map((ingredient) => (
                <div
                  key={ingredient.id}
                  className="flex items-center justify-between rounded-xl bg-gray-50 px-5 py-4"
                >
                  <span className="font-medium text-gray-900">
                    {ingredient.name}
                  </span>

                  <span className="text-gray-600">
                    {ingredient.quantity ?? ""}
                    {ingredient.unit
                      ? ` ${ingredient.unit}`
                      : ""}
                  </span>
                </div>
              ))}
            </div>

          </div>

          {/* START COOKING */}

          <div className="mt-10 border-t border-gray-200 pt-8">

            <Link
              href={`/recipes/${recipe.id}/cook`}
              className="block w-full rounded-xl bg-black px-6 py-4 text-center text-lg font-semibold text-white transition hover:bg-gray-800"
            >
              🍳 START COOKING
            </Link>

          </div>

        </section>
      </div>
    </main>
  );
}