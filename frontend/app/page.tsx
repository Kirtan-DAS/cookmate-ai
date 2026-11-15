import Link from "next/link";
import Navbar from "@/components/Navbar";

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-950">
      <Navbar />

      <section className="mx-auto flex min-h-[calc(100vh-73px)] max-w-7xl items-center px-6 py-16">
        <div className="grid w-full gap-14 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-green-700">
              Your intelligent kitchen companion
            </p>

            <h1 className="mt-4 max-w-3xl text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
              Cook better with what you already have.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-600">
              CookMate brings your pantry, recipes, grocery planning and
              guided cooking experience together in one place.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-xl bg-green-700 px-6 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-green-800"
              >
                Get Started
              </Link>

              <Link
                href="/recipes"
                className="inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-6 py-3.5 text-sm font-bold text-neutral-800 transition hover:bg-neutral-100"
              >
                Explore Recipes
              </Link>
            </div>

            <p className="mt-4 text-sm text-neutral-500">
              Explore CookMate as a guest or create an account for a
              personalized kitchen experience.
            </p>
          </div>

          <div className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="rounded-3xl bg-green-700 p-8 text-white">
              <p className="text-sm font-medium text-green-100">CookMate</p>

              <h2 className="mt-3 text-3xl font-bold leading-tight">
                From pantry to plate.
              </h2>

              <p className="mt-4 text-sm leading-6 text-green-100">
                Organize what you have, discover what you can make, and get
                help while you cook.
              </p>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-neutral-50 p-4">
                <p className="text-sm font-bold">Pantry</p>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  Manage your ingredients.
                </p>
              </div>

              <div className="rounded-2xl bg-neutral-50 p-4">
                <p className="text-sm font-bold">Recipes</p>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  Find meals to make.
                </p>
              </div>

              <div className="rounded-2xl bg-neutral-50 p-4">
                <p className="text-sm font-bold">Cooking</p>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  Cook with guidance.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}