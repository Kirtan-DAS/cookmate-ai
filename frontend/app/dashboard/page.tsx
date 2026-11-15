"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function DashboardPage() {
  const router = useRouter();

  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) {
        return;
      }

      if (!user) {
        router.replace("/login");
        return;
      }

      setEmail(user.email ?? null);
      setLoading(false);
    }

    loadUser();

    return () => {
      mounted = false;
    };
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="text-sm text-neutral-600">Loading CookMate...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-green-700">
              CookMate
            </p>
            <h1 className="text-xl font-bold text-neutral-950">
              Your kitchen dashboard
            </h1>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100"
          >
            Log out
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="rounded-3xl bg-green-700 p-8 text-white shadow-sm">
          <p className="text-sm font-medium text-green-100">
            Welcome back
          </p>

          <h2 className="mt-2 text-3xl font-bold tracking-tight">
            Cook smarter with what you already have.
          </h2>

          {email && (
            <p className="mt-3 text-sm text-green-100">
              Signed in as {email}
            </p>
          )}
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <a
            href="/pantry"
            className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <h3 className="text-lg font-bold text-neutral-950">Pantry</h3>
            <p className="mt-2 text-sm text-neutral-600">
              Manage your ingredients and quantities.
            </p>
          </a>

          <a
            href="/recipes"
            className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <h3 className="text-lg font-bold text-neutral-950">Recipes</h3>
            <p className="mt-2 text-sm text-neutral-600">
              Discover recipes based on your pantry.
            </p>
          </a>

          <a
            href="/meal-planner"
            className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <h3 className="text-lg font-bold text-neutral-950">
              Meal Planner
            </h3>
            <p className="mt-2 text-sm text-neutral-600">
              Plan meals and build your grocery list.
            </p>
          </a>
        </div>
      </section>
    </main>
  );
}