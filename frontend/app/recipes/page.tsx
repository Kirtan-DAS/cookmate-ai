"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import PantryNutritionPicks from "@/components/PantryNutritionPicks";
import { supabase } from "@/lib/supabase";
import "@/components/atelier.css";

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
  cooking_time_minutes: number | null;
  ingredients: { name: string; quantity: string | null; unit: string | null }[];
  steps: { instruction: string; timer_minutes: number | null }[];
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
  const [search, setSearch] = useState("");
  // The global CookMate search sends users to /recipes?q=...
  // Initialize the existing recipe filter from that search term.
  useEffect(() => {
    const term = new URLSearchParams(window.location.search).get("q") ?? "";
    setSearch(term);
    if (term) setVisibleCount(9);
  }, []);

  const [filter, setFilter] = useState<"all" | "ready" | "quick">("all");
  const [sort, setSort] = useState<"match" | "time">("match");
  const [visibleCount, setVisibleCount] = useState(9);
  const [hideSimilar, setHideSimilar] = useState(true);
  const visibleRecipes = recipes.filter(recipe => {
    const term = search.trim().toLowerCase();
    const searchable = [recipe.title, recipe.description ?? "", ...recipe.missing_ingredients].join(" ").toLowerCase();
    return (!term || searchable.includes(term)) &&
      (filter !== "ready" || recipe.missing_ingredients.length === 0) &&
      (filter !== "quick" || (recipe.cooking_time_minutes != null && recipe.cooking_time_minutes <= 20));
  }).sort((a,b) => sort === "time"
    ? (a.cooking_time_minutes ?? 999) - (b.cooking_time_minutes ?? 999) || b.match_percentage - a.match_percentage
    : b.match_percentage - a.match_percentage || (a.cooking_time_minutes ?? 999) - (b.cooking_time_minutes ?? 999));
  const deduplicatedRecipes = hideSimilar ? visibleRecipes.filter((recipe, index, all) =>
    all.findIndex(candidate => candidate.title.trim().toLowerCase() === recipe.title.trim().toLowerCase()) === index
  ) : visibleRecipes;


  // --------------------------------------------------
  // CookMate AI
  // --------------------------------------------------

  const aiRequestInProgress = useRef(false);
  const [aiRecommendations, setAiRecommendations] =
    useState<AIRecommendation[]>([]);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [savingRecipeIndex, setSavingRecipeIndex] =
    useState<number | null>(null);

  // --------------------------------------------------
  // Load normal recipe matches
  // --------------------------------------------------

  async function loadRecipes() {
    setLoading(true);
    setError("");
    setVisibleCount(9);

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
    if (aiRequestInProgress.current) return;
    aiRequestInProgress.current = true;

    setAiLoading(true);
    setAiError("");
    setAiRecommendations([]);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("Please log in to get CookMate AI recommendations.");
      }

      const response = await fetch(
        API_URL + "/api/ai/recommendations",
        {
          method: "GET",
          headers: {
            Authorization:
              "Bearer " + session.access_token,
          },
          cache: "no-store",
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

      const recommendations = Array.isArray(data?.recommendations)
        ? data.recommendations.slice(0, 2)
        : [];

      setAiRecommendations(recommendations);

      if (recommendations.length === 0) {
        setAiError(
          "CookMate couldn't find suitable recipes this time. Check your pantry ingredients or try again."
        );
      }
    } catch (err) {
      setAiError(
        err instanceof Error
          ? err.message
          : "Unable to get CookMate AI recommendations."
      );
    } finally {
      aiRequestInProgress.current = false;
      setAiLoading(false);
    }
  }

  // --------------------------------------------------
  // Save only the recipe selected by the user

  async function saveAIRecipe(
    recommendation: AIRecommendation,
    index: number
  ) {
    setSavingRecipeIndex(index);
    setAiError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("Please log in to save this recipe.");
      }

      const response = await fetch(
        `${API_URL}/api/ai/recommendations/save`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + session.access_token,
          },
          body: JSON.stringify({
            name: recommendation.name,
            description: recommendation.description,
            cooking_time_minutes: recommendation.cooking_time_minutes,
            ingredients: recommendation.ingredients,
            steps: recommendation.steps,
          }),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.detail || "Unable to save this recipe.");
      }

      setAiRecommendations((current) =>
        current.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                recipe_id: data.recipe_id,
                recipe_source: "database",
              }
            : item
        )
      );

    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : "Unable to save this recipe."
      );
    } finally {
      setSavingRecipeIndex(null);
    }
  }

  // Initial load
  // --------------------------------------------------

  useEffect(() => {
    loadRecipes();
  }, []);

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <main className="atelier atelier-recipes min-h-screen bg-neutral-50 text-neutral-950">
      <Navbar />

      <section className="atelier-content mx-auto max-w-7xl px-6 py-10">

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

        <PantryNutritionPicks />
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
                ? "Finding your best recipes..."
                : "Get My Best 2 Recipes"}
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

                    const isSaving = savingRecipeIndex === index;

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
                            <button
                              type="button"
                              onClick={() =>
                                router.push(`/recipes/${recommendation.recipe_id}`)
                              }
                              className="block w-full rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-green-700"
                            >
                              View Recipe
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={savingRecipeIndex !== null}
                              onClick={() => saveAIRecipe(recommendation, index)}
                              className="block w-full rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isSaving ? "Saving Recipe..." : "Save Recipe"}
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

        <div className="atelier-recipe-heading mt-10 flex items-center justify-between">

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

        <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <input aria-label="Search recipes" value={search} onChange={e => { setSearch(e.target.value); setVisibleCount(9); }} placeholder="Search recipes or missing ingredients" className="min-w-0 rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-green-600" />
            <select aria-label="Filter recipes" value={filter} onChange={e => { setFilter(e.target.value as typeof filter); setVisibleCount(9); }} className="rounded-xl border border-neutral-300 px-3 py-3 text-sm">
              <option value="all">All recipes</option><option value="ready">Can cook now</option><option value="quick">20 minutes or less</option>
            </select>
            <select aria-label="Sort recipes" value={sort} onChange={e => setSort(e.target.value as typeof sort)} className="rounded-xl border border-neutral-300 px-3 py-3 text-sm">
              <option value="match">Best pantry match</option><option value="time">Fastest first</option>
            </select>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-neutral-600"><input type="checkbox" checked={hideSimilar} onChange={e => { setHideSimilar(e.target.checked); setVisibleCount(9); }} className="accent-green-700" /> Group recipes with the same name</label>
            <span className="text-sm text-neutral-500">{deduplicatedRecipes.length} shown in results · {recipes.length} total recipes</span>
          </div>
        </div>
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

          ) : deduplicatedRecipes.length === 0 ? (
            <div className="rounded-2xl border bg-white p-8 text-center text-neutral-600">No recipes match these filters. Try another search.</div>
          ) : (

            <div>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">

              {deduplicatedRecipes.slice(0, visibleCount).map((recipe) => (

                <Link
                  key={recipe.recipe_id}
                  href={"/recipes/" + recipe.recipe_id}
                  className="group block"
                >

                  <article className="atelier-recipe-card h-full cursor-pointer rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-green-200 hover:shadow-md">

                    {/* CARD HEADER */}

                    <div className="flex items-start justify-between gap-4">

                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-50 text-sm font-bold text-green-700">
                        ✦
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

                    <p className="mt-5 text-sm font-semibold text-green-700 transition">
                      View recipe →
                    </p>

                  </article>

                </Link>

              ))}

            </div>
            {visibleCount < deduplicatedRecipes.length && (
              <div className="mt-7 text-center"><button type="button" onClick={() => setVisibleCount(count => count + 9)} className="rounded-xl border border-green-700 px-6 py-3 text-sm font-semibold text-green-800 hover:bg-green-50">Load 9 more recipes</button></div>
            )}
            </div>

          )}

        </div>

      </section>
    </main>
  );
}