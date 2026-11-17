"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type Profile = {
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity_level: string | null;
  diet_type: string | null;
  food_preferences: string[];
  dietary_restrictions: string[];
  nutrition_goals: string[];
  daily_calorie_target: number | null;
  daily_protein_target_g: number | null;
  daily_fiber_target_g: number | null;
};

const initialProfile: Profile = {
  age: null,
  height_cm: null,
  weight_kg: null,
  activity_level: null,
  diet_type: null,
  food_preferences: [],
  dietary_restrictions: [],
  nutrition_goals: [],
  daily_calorie_target: null,
  daily_protein_target_g: null,
  daily_fiber_target_g: null,
};

const goals = [
  "Muscle gain",
  "Weight management",
  "Heart health",
  "Gut health",
  "Bone health",
  "Better energy",
  "Balanced nutrition",
];

const preferences = [
  "South Indian",
  "North Indian",
  "Quick meals",
  "Budget friendly",
  "High protein",
  "Spicy food",
  "Mild food",
];

const restrictions = [
  "Dairy free",
  "Gluten free",
  "Nut free",
  "Egg free",
];

function toggleValue(items: string[], value: string) {
  return items.includes(value)
    ? items.filter((item) => item !== value)
    : [...items, value];
}

export default function OnboardingPage() {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const { data } = await supabase.auth.getSession();

        if (!data.session) {
          router.replace("/login");
          return;
        }

        const response = await fetch(
          `${API_URL}/api/nutrition/profile`,
          {
            headers: {
              Authorization: `Bearer ${data.session.access_token}`,
            },
          }
        );

        if (response.ok) {
          const saved = await response.json();
          if (active) {
            setProfile({
              ...initialProfile,
              ...saved,
            });
          }
        } else if (response.status !== 404) {
          const errorData = await response.json().catch(() => null);
          throw new Error(
            `Nutrition API error ${response.status}: ${
              typeof errorData?.detail === "string"
                ? errorData.detail
                : "Unable to load nutrition profile"
            }`
          );
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Unable to load profile"
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, [router]);

  function update<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile((previous) => ({ ...previous, [key]: value }));
  }

  async function saveProfile() {
    setSaving(true);
    setError("");

    try {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        router.replace("/login");
        return;
      }

      const response = await fetch(
        `${API_URL}/api/nutrition/profile`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(profile),
        }
      );

      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(
          typeof detail?.detail === "string"
            ? detail.detail
            : "Unable to save nutrition profile"
        );
      }

      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900";

  const chipClass = (selected: boolean) =>
    `rounded-xl border px-4 py-3 text-sm transition ${
      selected
        ? "border-green-600 bg-green-100 text-green-900"
        : "border-gray-300 bg-white text-gray-700"
    }`;

  function numberInput(
    label: string,
    key: "age" | "height_cm" | "weight_kg" |
      "daily_calorie_target" | "daily_protein_target_g" |
      "daily_fiber_target_g",
    placeholder: string
  ) {
    return (
      <label className="block space-y-2">
        <span className="font-medium">{label}</span>
        <input
          type="number"
          min={key === "age" ? 1 : 0.01}
          max={
            key === "age" ? 120 :
            key === "height_cm" ? 300 :
            key === "weight_kg" ? 500 : undefined
          }
          step={key === "age" || key === "daily_calorie_target" ? 1 : 0.1}
          className={inputClass}
          placeholder={placeholder}
          value={profile[key] ?? ""}
          onChange={(event) =>
            update(
              key,
              event.target.value === "" ? null : Number(event.target.value)
            )
          }
        />
      </label>
    );
  }

  if (loading) {
    return <main className="p-8">Loading CookMate profile...</main>;
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 text-gray-900">
      <div className="cm-onboard-page mx-auto max-w-2xl space-y-8 rounded-3xl bg-white p-6 shadow-sm md:p-10">
        <div>
          <p className="text-sm font-semibold text-green-700">
            COOKMATE AI
          </p>
          <h1 className="mt-2 text-3xl font-bold">
            Make CookMate yours
          </h1>
          <p className="mt-2 text-gray-600">
            Tell us about your food preferences and goals.
            You can update these details later.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Step {step} of 5</span>
            <span>{step * 20}%</span>
          </div>
          <div className="h-2 rounded-full bg-gray-200">
            <div
              className="h-2 rounded-full bg-green-600 transition-all"
              style={{ width: `${step * 20}%` }}
            />
          </div>
        </div>

        {step === 1 && (
          <section className="space-y-5">
            <h2 className="text-xl font-semibold">About you</h2>
            {numberInput("Age", "age", "e.g. 20")}
            {numberInput("Height (cm)", "height_cm", "e.g. 173")}
            {numberInput("Weight (kg)", "weight_kg", "e.g. 60")}
          </section>
        )}

        {step === 2 && (
          <section className="space-y-5">
            <h2 className="text-xl font-semibold">Your lifestyle</h2>
            <label className="block space-y-2">
              <span>Activity level</span>
              <select
                className={inputClass}
                value={profile.activity_level ?? ""}
                onChange={(e) => update("activity_level", e.target.value || null)}
              >
                <option value="">Select activity level</option>
                <option value="sedentary">Mostly sitting</option>
                <option value="light">Lightly active</option>
                <option value="moderate">Moderately active</option>
                <option value="very_active">Very active</option>
              </select>
            </label>
            <label className="block space-y-2">
              <span>Diet type</span>
              <select
                className={inputClass}
                value={profile.diet_type ?? ""}
                onChange={(e) => update("diet_type", e.target.value || null)}
              >
                <option value="">Select diet type</option>
                <option value="vegetarian">Vegetarian</option>
                <option value="non_vegetarian">Non-vegetarian</option>
                <option value="vegan">Vegan</option>
                <option value="eggetarian">Eggetarian</option>
              </select>
            </label>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-6">
            <h2 className="text-xl font-semibold">Your food preferences</h2>
            <div className="flex flex-wrap gap-2">
              {preferences.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={profile.food_preferences.includes(item)}
                  className={chipClass(profile.food_preferences.includes(item))}
                  onClick={() =>
                    update(
                      "food_preferences",
                      toggleValue(profile.food_preferences, item)
                    )
                  }
                >
                  {item}
                </button>
              ))}
            </div>
            <h3 className="font-semibold">Dietary restrictions</h3>
            <div className="flex flex-wrap gap-2">
              {restrictions.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={profile.dietary_restrictions.includes(item)}
                  className={chipClass(profile.dietary_restrictions.includes(item))}
                  onClick={() =>
                    update(
                      "dietary_restrictions",
                      toggleValue(profile.dietary_restrictions, item)
                    )
                  }
                >
                  {item}
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 4 && (
          <section className="space-y-5">
            <h2 className="text-xl font-semibold">
              What are your nutrition goals?
            </h2>
            <p className="text-gray-600">Select as many as you want.</p>
            <div className="flex flex-wrap gap-2">
              {goals.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={profile.nutrition_goals.includes(item)}
                  className={chipClass(profile.nutrition_goals.includes(item))}
                  onClick={() =>
                    update(
                      "nutrition_goals",
                      toggleValue(profile.nutrition_goals, item)
                    )
                  }
                >
                  {item}
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 5 && (
          <section className="space-y-5">
            <h2 className="text-xl font-semibold">Daily nutrition targets</h2>
            <p className="text-sm text-gray-600">
              Optional. Leave these blank if you haven't chosen targets yet.
              CookMate will not automatically calculate them in this version.
            </p>
            {numberInput("Calories (kcal)", "daily_calorie_target", "e.g. 2200")}
            {numberInput("Protein (g)", "daily_protein_target_g", "e.g. 90")}
            {numberInput("Fiber (g)", "daily_fiber_target_g", "e.g. 30")}
          </section>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">
            {error}
          </p>
        )}

        <div className="flex justify-between gap-3 pt-4">
          <button
            type="button"
            disabled={step === 1 || saving}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className="rounded-xl border px-6 py-3 disabled:opacity-40"
          >
            Back
          </button>

          {step < 5 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(5, s + 1))}
              className="rounded-xl bg-green-700 px-6 py-3 text-white"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={saveProfile}
              className="rounded-xl bg-green-700 px-6 py-3 text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save my profile"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}