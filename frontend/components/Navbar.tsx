"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Navbar() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      setSignedIn(Boolean(session));
      setLoading(false);
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;

      setSignedIn(Boolean(session));
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-700 text-lg font-bold text-white">
            C
          </div>

          <div>
            <p className="text-lg font-bold tracking-tight text-neutral-950">
              CookMate
            </p>
            <p className="hidden text-xs text-neutral-500 sm:block">
              Your intelligent kitchen companion
            </p>
          </div>
        </Link>

        <nav className="flex items-center gap-2">
          <Link
            href="/recipes"
            className="rounded-xl px-3 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100"
          >
            Recipes
          </Link>

          {!loading && signedIn && (
            <>
              <Link
                href="/pantry"
                className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100 sm:inline-flex"
              >
                Pantry
              </Link>

              <Link
                href="/dashboard"
                className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100 sm:inline-flex"
              >
                Dashboard
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                className="rounded-xl border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100"
              >
                Log out
              </button>
            </>
          )}

          {!loading && !signedIn && (
            <>
              <Link
                href="/login"
                className="rounded-xl border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100"
              >
                Sign In
              </Link>

              <Link
                href="/signup"
                className="hidden rounded-xl bg-green-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-800 sm:inline-flex"
              >
                Get Started
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}