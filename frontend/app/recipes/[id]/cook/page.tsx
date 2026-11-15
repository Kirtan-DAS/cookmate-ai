"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

type RecipeStep = {
  id: number;
  recipe_id: number;
  step_number: number;
  instruction: string;
  timer_minutes: number | null;
};

export default function CookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [steps, setSteps] = useState<RecipeStep[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [timeLeft, setTimeLeft] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);

  useEffect(() => {
    async function loadSteps() {
      try {
        const { id } = await params;

        const response = await fetch(
          `${API_URL}/api/recipes/${id}/steps`
        );

        if (!response.ok) {
          throw new Error("Failed to load cooking steps.");
        }

        const data = await response.json();

        setSteps(data);
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

    loadSteps();
  }, [params]);

  useEffect(() => {
    if (currentStep >= steps.length) {
      setTimerRunning(false);
      setTimeLeft(0);
      return;
    }

    if (steps.length > 0) {
      const minutes = steps[currentStep].timer_minutes ?? 0;

      setTimeLeft(minutes * 60);
      setTimerRunning(false);
    }
  }, [currentStep, steps]);

  useEffect(() => {
    if (!timerRunning || timeLeft <= 0) {
      if (timeLeft === 0) {
        setTimerRunning(false);
      }

      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((previous) => previous - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timerRunning, timeLeft]);

  async function completeStep() {
    setTimerRunning(false);

    const isLastStep = currentStep === steps.length - 1;

    if (!isLastStep) {
      setCurrentStep((previous) => previous + 1);
      return;
    }

    try {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        throw new Error("Unable to get your login session.");
      }

      const accessToken = data.session?.access_token;

      if (!accessToken) {
        throw new Error("You are not logged in.");
      }

      const response = await fetch(
        `${API_URL}/api/recipes/${step.recipe_id}/complete`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.detail || "Failed to update pantry."
        );
      }

      console.log("Pantry deduction result:", result);

      setCurrentStep((previous) => previous + 1);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to complete recipe."
      );
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 p-10">
        <div className="mx-auto max-w-3xl">
          <p className="text-gray-600">
            Loading cooking mode...
          </p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gray-50 p-10">
        <div className="mx-auto max-w-3xl">
          <p className="text-red-600">{error}</p>

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

  if (steps.length === 0) {
    return (
      <main className="min-h-screen bg-gray-50 p-10">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-bold text-gray-900">
            No cooking steps found
          </h1>

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

  if (currentStep >= steps.length) {
    return (
      <main className="min-h-screen bg-gray-50 px-6 py-10">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
            <div className="text-6xl">
              🎉
            </div>

            <h1 className="mt-6 text-4xl font-bold text-gray-900">
              Cooking Complete!
            </h1>

            <p className="mt-4 text-lg text-gray-600">
              Your meal is ready. Enjoy your food!
            </p>

            <Link
              href="/recipes"
              className="mt-8 inline-block rounded-xl bg-black px-8 py-4 font-semibold text-white hover:bg-gray-800"
            >
              ← Back to Recipes
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const step = steps[currentStep];

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const formattedTime =
    `${minutes.toString().padStart(2, "0")}:` +
    `${seconds.toString().padStart(2, "0")}`;

  const progress =
    ((currentStep + 1) / steps.length) * 100;

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <Link
          href={`/recipes/${step.recipe_id}`}
          className="mb-6 inline-block text-sm text-blue-600 hover:underline"
        >
          ← Exit Cooking Mode
        </Link>

        <section className="rounded-2xl bg-white p-8 shadow-sm">
          {/* Progress */}
          <div className="mb-8">
            <div className="mb-2 flex justify-between text-sm text-gray-600">
              <span>
                Step {currentStep + 1} of {steps.length}
              </span>

              <span>
                {Math.round(progress)}%
              </span>
            </div>

            <div className="h-3 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-black transition-all"
                style={{
                  width: `${progress}%`,
                }}
              />
            </div>
          </div>

          {/* Current Step */}
          <div className="text-center">
            <div className="text-5xl">
              🍳
            </div>

            <h1 className="mt-6 text-3xl font-bold text-gray-900">
              Step {step.step_number}
            </h1>

            <p className="mt-6 text-xl leading-relaxed text-gray-700">
              {step.instruction}
            </p>
          </div>

          {/* Timer */}
          {step.timer_minutes !== null && (
            <div className="mt-10 rounded-2xl bg-gray-50 p-6 text-center">
              <p className="text-sm font-medium text-gray-500">
                TIMER
              </p>

              <div className="mt-2 text-5xl font-bold text-gray-900">
                {formattedTime}
              </div>

              <button
                type="button"
                onClick={() =>
                  setTimerRunning((running) => !running)
                }
                disabled={timeLeft === 0}
                className="mt-5 rounded-xl bg-gray-900 px-6 py-3 font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {timerRunning
                  ? "Pause Timer"
                  : "Start Timer"}
              </button>
            </div>
          )}

          {/* Complete Step */}
          <button
            type="button"
            onClick={completeStep}
            className="mt-10 w-full rounded-xl bg-black px-6 py-4 text-lg font-semibold text-white hover:bg-gray-800"
          >
            ✓ I've completed this step
          </button>
        </section>
      </div>
    </main>
  );
}