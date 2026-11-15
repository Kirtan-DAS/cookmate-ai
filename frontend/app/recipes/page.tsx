"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { supabase } from "@/lib/supabase";

type RecipeMatch = {
  recipe_id: number;
  title: string;
  description: string | null;
  cooking_time_minutes: number | null;
  available_ingredients: number;
  total_ingredients: number;
  match_percentage: number;
  missing_ingredients: string[];
};

type AIRecommendation = {
  name: string;
  description: string;
  uses: string[];
  missing: string[];
  why_it_matches: string;
  recipe_id: number | null;
  recipe_source:
    | "database"
    | "ai_generated"
    | "generation_failed"
    | "save_failed";
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function RecipesPage() {
  const router = useRouter();

  // --------------------------------------------------
  // Recipe Matches
  // --------------------------------------------------

  const [recipes, setRecipes] = useState<RecipeMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // --------------------------------------------------
  // CookMate AI
  // --------------------------------------------------

  const [aiRecommendations, setAiRecommendations] =
    useState<AIRecommendation[]>([]);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [deletingRecipeId, setDeletingRecipeId] =
    useState<number | null>(null);

  // --------------------------------------------------
  // Load normal recipe matches
  // --------------------------------------------------

  async function loadRecipes() {
    setLoading(true);
    setError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError(
          "Please log in to see recipes matched with your pantry."
        );

        setLoading(false);
        return;
      }

      const response = await fetch(
        API_URL + "/api/recipes/matches",
        {
          headers: {
            Authorization:
              "Bearer " + session.access_token,
          },
        }
      );

      if (!response.ok) {
        const data =
          await response.json().catch(() => null);

        throw new Error(
          data?.detail ||
            "Unable to load recipe matches."
        );
      }

      const data = await response.json();

      setRecipes(
        Array.isArray(data.matches)
          ? data.matches
          : []
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load recipe matches."
      );
    } finally {
      setLoading(false);
    }
  }

  // --------------------------------------------------
  // Ask CookMate AI
  // --------------------------------------------------

  async function loadAIRecommendations() {
    setAiLoading(true);
    setAiError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setAiError(
          "Please log in to get CookMate AI recommendations."
        );

        return;
      }

      const response = await fetch(
        API_URL + "/api/ai/recommendations",
        {
          method: "GET",
          headers: {
            Authorization:
              "Bearer " + session.access_token,
          },
        }
      );

      const data =
        await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            "Unable to get CookMate AI recommendations."
        );
      }

      setAiRecommendations(
        Array.isArray(data?.recommendations)
          ? data.recommendations
          : []
      );
    } catch (err) {
      setAiError(
        err instanceof Error
          ? err.message
          : "Unable to get CookMate AI recommendations."
      );
    } finally {
      setAiLoading(false);
    }
  }

  // --------------------------------------------------
  // Delete AI-generated recipe
  // --------------------------------------------------

  async function deleteAIRecipe(recipeId: number) {
    const confirmed = window.confirm(
      "Delete this AI-generated recipe?\n\nThis will permanently remove the recipe from CookMate."
    );

    if (!confirmed) {
      return;
    }

    setDeletingRecipeId(recipeId);
    setAiError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setAiError(
          "Please log in to delete this recipe."
        );

        return;
      }

      const response = await fetch(
        `${API_URL}/api/ai/recipes/${recipeId}`,
        {
          method: "DELETE",
          headers: {
            Authorization:
              "Bearer " + session.access_token,
          },
        }
      );

      const data =
        await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            "Unable to delete the recipe."
        );
      }

      // Remove the deleted AI recommendation
      setAiRecommendations((current) =>
        current.filter(
          (recommendation) =>
            recommendation.recipe_id !== recipeId
        )
      );

      // Remove it from Recipe Matches too,
      // if it is currently displayed there.
      setRecipes((current) =>
        current.filter(
          (recipe) =>
            recipe.recipe_id !== recipeId
        )
      );
    } catch (err) {
      setAiError(
        err instanceof Error
          ? err.message
          : "Unable to delete the recipe."
      );
    } finally {
      setDeletingRecipeId(null);
    }
  }

  // --------------------------------------------------
  // Initial load
  // --------------------------------------------------

  useEffect(() => {
    loadRecipes();
  }, []);

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-950">
      <Navbar />

      <section className="mx-auto max-w-7xl px-6 py-10">

        {/* -------------------------------------------- */}
        {/* PAGE HEADER */}
        {/* -------------------------------------------- */}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-green-700">
              Recipes
            </p>

            <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
              Cook with what you have.
            </h1>

            <p className="mt-4 max-w-3xl text-lg leading-8 text-neutral-600">
              CookMate checks your pantry and shows
              which recipes you can make right now.
            </p>
          </div>

          <Link
            className="inline-flex w-fit rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100"
            href="/pantry"
          >
            View Pantry
          </Link>
        </div>

        {/* -------------------------------------------- */}
        {/* NORMAL ERROR */}
        {/* -------------------------------------------- */}

        {error && (
          <div
            role="alert"
            className="mt-8 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {/* ============================================ */}
        {/* COOKMATE AI SECTION */}
        {/* ============================================ */}

        <div className="mt-10 rounded-3xl border border-green-200 bg-green-50 p-6">

          {/* AI HEADER */}

          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">

            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-green-700">
                CookMate AI
              </p>

              <h2 className="mt-2 text-2xl font-bold text-neutral-950">
                What should I cook today?
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
                CookMate AI will look at your current
                pantry and recommend recipes based on
                the ingredients you already have.
              </p>
            </div>

            <button
              type="button"
              onClick={loadAIRecommendations}
              disabled={aiLoading}
              className="shrink-0 rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {aiLoading
                ? "CookMate AI is thinking..."
                : "Ask CookMate AI"}
            </button>
          </div>

          {/* AI ERROR */}

          {aiError && (
            <div
              role="alert"
              className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {aiError}
            </div>
          )}

          {/* ========================================== */}
          {/* AI RECOMMENDATIONS */}
          {/* ========================================== */}

          {aiRecommendations.length > 0 && (
            <div className="mt-7">

              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg">
                  AI
                </div>

                <h3 className="text-lg font-bold text-neutral-950">
                  CookMate AI's Recommendations
                </h3>
              </div>

              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">

                {aiRecommendations.map(
                  (recommendation, index) => {

                    const isDeleting =
                      deletingRecipeId ===
                      recommendation.recipe_id;

                    return (
                      <article
                        key={`${recommendation.name}-${index}`}
                        className="flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-green-200 hover:shadow-md"
                      >

                        {/* CARD TOP */}

                        <div className="flex items-start justify-between gap-3">

                          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-50 text-sm font-bold text-green-700">
                            AI
                          </div>

                          <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
                            AI Pick
                          </span>

                        </div>

                        {/* TITLE */}

                        <h4 className="mt-5 text-xl font-bold text-neutral-950">
                          {recommendation.name}
                        </h4>

                        {/* DESCRIPTION */}

                        <p className="mt-3 text-sm leading-6 text-neutral-600">
                          {recommendation.description}
                        </p>

                        {/* PANTRY INGREDIENTS */}

                        {recommendation.uses &&
                          recommendation.uses.length > 0 && (
                            <div className="mt-5">

                              <p className="text-sm font-semibold text-neutral-950">
                                Uses from your pantry
                              </p>

                              <div className="mt-2 flex flex-wrap gap-2">

                                {recommendation.uses.map(
                                  (ingredient) => (
                                    <span
                                      key={ingredient}
                                      className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700"
                                    >
                                      ✓ {ingredient}
                                    </span>
                                  )
                                )}

                              </div>
                            </div>
                          )}

                        {/* MISSING INGREDIENTS */}

                        {recommendation.missing &&
                          recommendation.missing.length > 0 && (
                            <div className="mt-5">

                              <p className="text-sm font-semibold text-neutral-950">
                                Missing ingredients
                              </p>

                              <div className="mt-2 flex flex-wrap gap-2">

                                {recommendation.missing.map(
                                  (ingredient) => (
                                    <span
                                      key={ingredient}
                                      className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700"
                                    >
                                      + {ingredient}
                                    </span>
                                  )
                                )}

                              </div>
                            </div>
                          )}

                        {/* WHY IT MATCHES */}

                        <div className="mt-5 rounded-xl bg-neutral-50 p-4">

                          <p className="text-sm font-semibold text-neutral-950">
                            Why this matches
                          </p>

                          <p className="mt-1 text-sm leading-6 text-neutral-600">
                            {recommendation.why_it_matches}
                          </p>

                        </div>

                        {/* ACTIONS */}

                        <div className="mt-auto flex gap-3 pt-5">

                          {recommendation.recipe_id ? (
                            <>
                              {/* VIEW RECIPE */}

                              <button
                                type="button"
                                disabled={isDeleting}
                                onClick={() =>
                                  router.push(
                                    `/recipes/${recommendation.recipe_id}`
                                  )
                                }
                                className="flex-1 rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                View Recipe
                              </button>

                              {/* DELETE ONLY AI-GENERATED RECIPES */}

                              {recommendation.recipe_source ===
                                "ai_generated" && (
                                <button
                                  type="button"
                                  disabled={isDeleting}
                                  onClick={() =>
                                    deleteAIRecipe(
                                      recommendation.recipe_id as number
                                    )
                                  }
                                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {isDeleting
                                    ? "Deleting..."
                                    : "Delete"}
                                </button>
                              )}
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled
                              className="block w-full cursor-not-allowed rounded-xl bg-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-500"
                            >
                              Recipe Not Saved Yet
                            </button>
                          )}

                        </div>

                      </article>
                    );
                  }
                )}

              </div>
            </div>
          )}

        </div>

        {/* ============================================ */}
        {/* RECIPE MATCHES */}
        {/* ============================================ */}

        <div className="mt-10 flex items-center justify-between">

          <div>

            <h2 className="text-2xl font-bold tracking-tight">
              Recipe Matches
            </h2>

            {!loading && (
              <p className="mt-1 text-sm text-neutral-500">
                {recipes.length}{" "}
                {recipes.length === 1
                  ? "recipe"
                  : "recipes"}{" "}
                matched against your pantry
              </p>
            )}

          </div>

          <button
            type="button"
            onClick={loadRecipes}
            disabled={loading}
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>

        </div>

        {/* -------------------------------------------- */}
        {/* RECIPE MATCH CONTENT */}
        {/* -------------------------------------------- */}

        <div className="mt-6">

          {loading ? (

            <div className="rounded-3xl border border-neutral-200 bg-white p-10 text-center shadow-sm">

              <p className="text-sm text-neutral-500">
                Checking your pantry against recipes...
              </p>

            </div>

          ) : recipes.length === 0 ? (

            <div className="rounded-3xl border border-dashed border-neutral-300 bg-white p-10 text-center">

              <h3 className="text-xl font-bold">
                No recipe matches yet
              </h3>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-500">
                Add ingredients to your pantry and make
                sure your recipes have ingredients configured.
              </p>

              <Link
                className="mt-5 inline-flex rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700"
                href="/pantry"
              >
                Go to Pantry
              </Link>

            </div>

          ) : (

            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">

              {recipes.map((recipe) => (

                <Link
                  key={recipe.recipe_id}
                  href={"/recipes/" + recipe.recipe_id}
                  className="group block"
                >

                  <article className="h-full cursor-pointer rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-green-200 hover:shadow-md">

                    {/* CARD HEADER */}

                    <div className="flex items-start justify-between gap-4">

                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-50 text-sm font-bold text-green-700">
                        🍳
                      </div>

                      <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
                        {recipe.match_percentage}% match
                      </span>

                    </div>

                    {/* TITLE */}

                    <h3 className="mt-5 text-xl font-bold group-hover:text-green-700">
                      {recipe.title}
                    </h3>

                    {/* COOKING TIME */}

                    {recipe.cooking_time_minutes !==
                      null && (
                      <p className="mt-1 text-sm font-medium text-neutral-500">
                        {recipe.cooking_time_minutes} min
                      </p>
                    )}

                    {/* DESCRIPTION */}

                    <p className="mt-3 text-sm leading-6 text-neutral-600">
                      {recipe.description ||
                        "No description available for this recipe."}
                    </p>

                    {/* PANTRY MATCH */}

                    <div className="mt-5 rounded-xl bg-neutral-50 p-4">

                      <p className="text-sm font-semibold">
                        Pantry match
                      </p>

                      <p className="mt-1 text-sm text-neutral-600">
                        {recipe.available_ingredients}{" "}
                        of{" "}
                        {recipe.total_ingredients}{" "}
                        ingredients available
                      </p>

                    </div>

                    {/* MISSING INGREDIENTS */}

                    {recipe.missing_ingredients.length >
                      0 && (
                      <div className="mt-4">

                        <p className="text-sm font-semibold">
                          Missing ingredients
                        </p>

                        <div className="mt-2 flex flex-wrap gap-2">

                          {recipe.missing_ingredients.map(
                            (ingredient) => (
                              <span
                                key={ingredient}
                                className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700"
                              >
                                {ingredient}
                              </span>
                            )
                          )}

                        </div>

                      </div>
                    )}

                    {/* EVERYTHING AVAILABLE */}

                    {recipe.missing_ingredients.length ===
                      0 && (
                      <div className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
                        🎉 You have everything needed!
                      </div>
                    )}

                    {/* VIEW RECIPE */}

                    <p className="mt-5 text-sm font-semibold text-green-700 opacity-0 transition group-hover:opacity-100">
                      View recipe →
                    </p>

                  </article>

                </Link>

              ))}

            </div>

          )}

        </div>

      </section>
    </main>
  );
}