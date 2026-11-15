"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { supabase } from "@/lib/supabase";

type PantryItem = {
  id: number;
  user_id: string;
  ingredient_id: number | null;
  name: string;
  quantity: string | null;
  unit: string | null;
  category: string | null;
  purchase_date: string | null;
  expiry_date: string | null;
  expiry_source: string | null;
  storage_location: string | null;
  created_at: string;
  updated_at: string;
};

type PantryForm = {
  name: string;
  quantity: string;
  unit: string;
  category: string;
  storage_location: string;
};

type ScannedItem = {
  id: number;
  name: string;
  quantity: string;
  unit: string;
  category: string;
  selected: boolean;
};

type StockInput = {
  amount: string;
  unit: string;
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

const initialForm: PantryForm = {
  name: "",
  quantity: "",
  unit: "",
  category: "",
  storage_location: "",
};

export default function PantryPage() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [form, setForm] = useState<PantryForm>(initialForm);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingForm, setEditingForm] =
    useState<PantryForm>(initialForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [stockInputs, setStockInputs] = useState<Record<number, StockInput>>({});
  const [adjustingId, setAdjustingId] = useState<number | null>(null);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Grocery bill scanner state
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [savingScanned, setSavingScanned] = useState(false);
  const [scanProgress, setScanProgress] = useState("");

  async function getAccessToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token ?? null;
  }

  async function loadPantry() {
    setLoading(true);
    setError("");

    const token = await getAccessToken();

    if (!token) {
      setError("Please sign in to access your pantry.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/pantry/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || "Unable to load your pantry.");
      }

      const data: PantryItem[] = await response.json();
      setItems(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load your pantry."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (!session) {
        setError("Please sign in to access your pantry.");
        setLoading(false);
        return;
      }

      await loadPantry();
    }

    initialize();

    return () => {
      mounted = false;
    };
  }, []);

  function clearNotifications() {
    setError("");
    setMessage("");
  }

  // Scan grocery bill using Tesseract.js in the browser
  async function handleScanBill() {
    clearNotifications();

    if (!scanFile) {
      setError("Please choose a grocery bill image first.");
      return;
    }

    if (!scanFile.type.startsWith("image/")) {
      setError("Please select a valid image.");
      return;
    }

    if (scanFile.size > 10 * 1024 * 1024) {
      setError("Image must be smaller than 10 MB.");
      return;
    }

    setScanning(true);
    setScannedItems([]);
    setScanProgress("Starting OCR...");

    let worker: Awaited<
      ReturnType<typeof import("tesseract.js").createWorker>
    > | null = null;

    try {
      const { createWorker } = await import("tesseract.js");

      worker = await createWorker("eng");

      setScanProgress("Reading your grocery bill...");

      const result = await worker.recognize(scanFile);
      const rawText = result.data.text;

      const ignoredWords =
        /\b(total|subtotal|tax|gst|cgst|sgst|invoice|receipt|cash|change|discount|amount|balance|payment|thank you|round off|bill no|phone|address|date|time)\b/i;

      const lines = rawText
        .split(/\r?\n/)
        .map((line) =>
          line
            .replace(/\s+/g, " ")
            .replace(/\s+(?:₹|rs\.?)?\s*\d+[.,]\d{2}\s*$/i, "")
            .trim()
        )
        .filter(
          (line) =>
            line.length >= 2 &&
            /[a-zA-Z]/.test(line) &&
            !ignoredWords.test(line) &&
            !/^[\d\s.,₹/-]+$/.test(line)
        );

      const uniqueLines = Array.from(
        new Set(lines.map((line) => line.slice(0, 100)))
      );

      const candidates: ScannedItem[] = uniqueLines.map(
        (line, index) => ({
          id: index,
          name: line,
          quantity: "",
          unit: "",
          category: "",
          selected: false,
        })
      );

      setScannedItems(candidates);

      if (candidates.length === 0) {
        setError(
          "No possible ingredients were detected. Try a clearer bill image."
        );
        setScanProgress("");
      } else {
        setScanProgress(
          `Found ${candidates.length} possible items. Review and select the ingredients you want.`
        );
      }
    } catch (err) {
      console.error("Bill OCR error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to read this bill. Please try another image."
      );

      setScanProgress("");
    } finally {
      if (worker) {
        await worker.terminate();
      }

      setScanning(false);
    }
  }

  // Save only selected and reviewed items
  async function handleSaveScannedItems() {
    clearNotifications();

    const selectedItems = scannedItems.filter(
      (item) => item.selected && item.name.trim()
    );

    if (selectedItems.length === 0) {
      setError("Select at least one ingredient to save.");
      return;
    }

    setSavingScanned(true);

    let savedCount = 0;

    try {
      const token = await getAccessToken();

      if (!token) {
        throw new Error(
          "Your session has expired. Please sign in again."
        );
      }

      for (const item of selectedItems) {
        const response = await fetch(`${API_URL}/api/pantry/`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: item.name.trim(),
            quantity: item.quantity.trim() || null,
            unit: item.unit.trim() || null,
            category: item.category.trim() || null,
            storage_location: null,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);

          throw new Error(
            data?.detail ||
              `Could not save ${item.name}. ${savedCount} items were saved before this error.`
          );
        }

        savedCount++;
      }

      setScannedItems([]);
      setScanFile(null);
      setScanProgress("");

      const fileInput = document.getElementById(
        "bill-image"
      ) as HTMLInputElement | null;

      if (fileInput) fileInput.value = "";

      await loadPantry();

      setMessage(
        `${savedCount} selected ${
          savedCount === 1 ? "ingredient was" : "ingredients were"
        } saved to your pantry.`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save scanned ingredients."
      );
    } finally {
      setSavingScanned(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearNotifications();

    const cleanName = form.name.trim();

    if (!cleanName) {
      setError("Ingredient name is required.");
      return;
    }

    setSaving(true);

    const token = await getAccessToken();

    if (!token) {
      setError("Your session has expired. Please sign in again.");
      setSaving(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/pantry/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: cleanName,
          quantity: form.quantity.trim() || null,
          unit: form.unit.trim() || null,
          category: form.category.trim() || null,
          storage_location: form.storage_location.trim() || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || "Unable to add ingredient.");
      }

      const newItem: PantryItem = await response.json();

      setItems((current) => {
        const existingIndex = current.findIndex(
          (item) => item.id === newItem.id
        );

        if (existingIndex === -1) {
          return [...current, newItem].sort((a, b) =>
            a.name.localeCompare(b.name)
          );
        }

        const updated = [...current];
        updated[existingIndex] = newItem;

        return updated.sort((a, b) =>
          a.name.localeCompare(b.name)
        );
      });

      setForm(initialForm);
      setMessage(`${newItem.name} was added to your pantry.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to add ingredient."
      );
    } finally {
      setSaving(false);
    }
  }

  function startEditing(item: PantryItem) {
    clearNotifications();
    setEditingId(item.id);

    setEditingForm({
      name: item.name,
      quantity: item.quantity ?? "",
      unit: item.unit ?? "",
      category: item.category ?? "",
      storage_location: item.storage_location ?? "",
    });
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingForm(initialForm);
  }

  async function handleUpdate(
    event: FormEvent<HTMLFormElement>,
    itemId: number
  ) {
    event.preventDefault();
    clearNotifications();

    const cleanName = editingForm.name.trim();

    if (!cleanName) {
      setError("Ingredient name is required.");
      return;
    }

    setSaving(true);

    const token = await getAccessToken();

    if (!token) {
      setError("Your session has expired. Please sign in again.");
      setSaving(false);
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/api/pantry/${itemId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: cleanName,
            quantity: editingForm.quantity.trim() || null,
            unit: editingForm.unit.trim() || null,
            category: editingForm.category.trim() || null,
            storage_location:
              editingForm.storage_location.trim() || null,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          data?.detail || "Unable to update pantry item."
        );
      }

      const updatedItem: PantryItem = await response.json();

      setItems((current) =>
        current
          .map((item) =>
            item.id === updatedItem.id ? updatedItem : item
          )
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setEditingId(null);
      setEditingForm(initialForm);
      setMessage(`${updatedItem.name} was updated.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update pantry item."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleStockAdjustment(
    item: PantryItem,
    operation: "add" | "consume"
  ) {
    clearNotifications();

    const input = stockInputs[item.id] ?? {
      amount: "",
      unit: item.unit ?? "",
    };

    const amount = Number(input.amount);
    const unit = input.unit.trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid quantity greater than zero.");
      return;
    }

    if (!unit) {
      setError("Enter a unit such as g, kg, ml, L or pieces.");
      return;
    }

    setAdjustingId(item.id);

    try {
      const token = await getAccessToken();

      if (!token) {
        throw new Error("Session expired. Please sign in again.");
      }

      const response = await fetch(
        `${API_URL}/api/pantry/${item.id}/stock`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount,
            unit,
            operation,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || "Unable to adjust pantry stock.");
      }

      const updatedItem: PantryItem = await response.json();

      setItems((current) =>
        current.map((entry) =>
          entry.id === updatedItem.id ? updatedItem : entry
        )
      );

      setStockInputs((current) => ({
        ...current,
        [item.id]: {
          amount: "",
          unit: updatedItem.unit ?? unit,
        },
      }));

      setMessage(
        `${updatedItem.name}: stock ${
          operation === "add" ? "increased" : "reduced"
        } to ${updatedItem.quantity} ${updatedItem.unit ?? ""}.`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to adjust stock."
      );
    } finally {
      setAdjustingId(null);
    }
  }

  async function handleDelete(itemId: number) {
    clearNotifications();

    const confirmed = window.confirm(
      "Are you sure you want to remove this ingredient from your pantry?"
    );

    if (!confirmed) return;

    setDeletingId(itemId);

    const token = await getAccessToken();

    if (!token) {
      setError("Your session has expired. Please sign in again.");
      setDeletingId(null);
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/api/pantry/${itemId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          data?.detail || "Unable to delete pantry item."
        );
      }

      setItems((current) =>
        current.filter((item) => item.id !== itemId)
      );

      if (editingId === itemId) {
        cancelEditing();
      }

      setMessage("Pantry item deleted.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to delete pantry item."
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-950">
      <Navbar />

      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-green-700">
              My Pantry
            </p>

            <h1 className="mt-2 text-4xl font-bold tracking-tight">
              What do you have?
            </h1>

            <p className="mt-3 max-w-2xl text-neutral-600">
              Keep your ingredients organized so CookMate can use them for
              recipes, meal planning and grocery decisions.
            </p>
          </div>

          <Link
            href="/recipes"
            className="inline-flex w-fit rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100"
          >
            Explore Recipes
          </Link>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-8 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {message && (
          <div
            role="status"
            className="mt-8 rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-700"
          >
            {message}
          </div>
        )}

        {/* GROCERY BILL SCANNER */}
        <section className="mt-8 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wider text-green-700">
            Smart Pantry Scanner
          </p>

          <h2 className="mt-2 text-2xl font-bold">
            Scan your grocery bill
          </h2>

          <p className="mt-2 text-sm text-neutral-500">
            Upload or capture a grocery bill. Review detected items before
            adding them to your pantry.
          </p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              id="bill-image"
              type="file"
              accept="image/*"
              capture="environment"
              disabled={scanning || savingScanned}
              onChange={(event) => {
                setScanFile(event.target.files?.[0] ?? null);
                setScannedItems([]);
                setScanProgress("");
                clearNotifications();
              }}
              className="w-full rounded-xl border border-neutral-300 p-3 text-sm"
            />

            <button
              type="button"
              onClick={handleScanBill}
              disabled={!scanFile || scanning || savingScanned}
              className="rounded-xl bg-green-700 px-6 py-3 font-semibold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {scanning ? "Scanning..." : "Scan Bill"}
            </button>
          </div>

          {scanProgress && (
            <p className="mt-4 text-sm text-green-700">
              {scanProgress}
            </p>
          )}

          {scannedItems.length > 0 && (
            <div className="mt-6 border-t border-neutral-200 pt-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-bold">
                  Review detected items
                </h3>

                <button
                  type="button"
                  onClick={() =>
                    setScannedItems((current) =>
                      current.map((item) => ({
                        ...item,
                        selected: !current.every(
                          (entry) => entry.selected
                        ),
                      }))
                    )
                  }
                  className="text-sm font-semibold text-green-700 hover:underline"
                >
                  {scannedItems.every((item) => item.selected)
                    ? "Deselect all"
                    : "Select all"}
                </button>
              </div>

              <div className="space-y-3">
                {scannedItems.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-3 rounded-2xl border border-neutral-200 p-4 sm:grid-cols-[auto_1fr_110px_100px]"
                  >
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(event) =>
                          setScannedItems((current) =>
                            current.map((entry) =>
                              entry.id === item.id
                                ? {
                                    ...entry,
                                    selected: event.target.checked,
                                  }
                                : entry
                            )
                          )
                        }
                        className="h-5 w-5 accent-green-700"
                        aria-label={`Select ${item.name}`}
                      />
                    </div>

                    <input
                      type="text"
                      value={item.name}
                      onChange={(event) =>
                        setScannedItems((current) =>
                          current.map((entry) =>
                            entry.id === item.id
                              ? { ...entry, name: event.target.value }
                              : entry
                          )
                        )
                      }
                      placeholder="Ingredient name"
                      className="min-w-0 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                    />

                    <input
                      type="text"
                      value={item.quantity}
                      onChange={(event) =>
                        setScannedItems((current) =>
                          current.map((entry) =>
                            entry.id === item.id
                              ? {
                                  ...entry,
                                  quantity: event.target.value,
                                }
                              : entry
                          )
                        )
                      }
                      placeholder="Quantity"
                      className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                    />

                    <input
                      type="text"
                      value={item.unit}
                      onChange={(event) =>
                        setScannedItems((current) =>
                          current.map((entry) =>
                            entry.id === item.id
                              ? { ...entry, unit: event.target.value }
                              : entry
                          )
                        )
                      }
                      placeholder="Unit"
                      className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                    />
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleSaveScannedItems}
                disabled={
                  savingScanned ||
                  !scannedItems.some(
                    (item) => item.selected && item.name.trim()
                  )
                }
                className="mt-5 w-full rounded-xl bg-green-700 px-5 py-3 font-semibold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {savingScanned
                  ? "Saving selected items..."
                  : `Add selected items (${
                      scannedItems.filter(
                        (item) => item.selected && item.name.trim()
                      ).length
                    }) to Pantry`}
              </button>
            </div>
          )}
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-[360px_1fr]">
          {/* ADD INGREDIENT */}
          <section className="h-fit rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold">Add ingredient</h2>

            <p className="mt-2 text-sm leading-6 text-neutral-500">
              Add an ingredient manually to your pantry.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="name" className="mb-2 block text-sm font-medium">
                  Ingredient
                </label>

                <input
                  id="name"
                  type="text"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="e.g. Tomato"
                  required
                  className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="quantity" className="mb-2 block text-sm font-medium">
                    Quantity
                  </label>

                  <input
                    id="quantity"
                    type="text"
                    value={form.quantity}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        quantity: event.target.value,
                      }))
                    }
                    placeholder="1"
                    className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-100"
                  />
                </div>

                <div>
                  <label htmlFor="unit" className="mb-2 block text-sm font-medium">
                    Unit
                  </label>

                  <input
                    id="unit"
                    type="text"
                    value={form.unit}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        unit: event.target.value,
                      }))
                    }
                    placeholder="kg"
                    className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-100"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="category" className="mb-2 block text-sm font-medium">
                  Category
                </label>

                <input
                  id="category"
                  type="text"
                  value={form.category}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                  placeholder="Vegetables"
                  className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-100"
                />
              </div>

              <div>
                <label htmlFor="storage" className="mb-2 block text-sm font-medium">
                  Storage
                </label>

                <input
                  id="storage"
                  type="text"
                  value={form.storage_location}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      storage_location: event.target.value,
                    }))
                  }
                  placeholder="Fridge"
                  className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-100"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-green-700 px-4 py-3 font-semibold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Adding..." : "Add to Pantry"}
              </button>
            </form>
          </section>

          {/* PANTRY LIST */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Your ingredients</h2>

                {!loading && (
                  <p className="mt-1 text-sm text-neutral-500">
                    {items.length}{" "}
                    {items.length === 1 ? "ingredient" : "ingredients"}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={loadPantry}
                disabled={loading}
                className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-50"
              >
                {loading ? "Loading..." : "Refresh"}
              </button>
            </div>

            {loading ? (
              <div className="rounded-3xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
                <p className="text-sm text-neutral-500">
                  Loading your pantry...
                </p>
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-neutral-300 bg-white p-10 text-center">
                <h3 className="text-xl font-bold">Your pantry is empty</h3>

                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-500">
                  Add your first ingredient using the form.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {items.map((item) => {
                  const isEditing = editingId === item.id;

                  if (isEditing) {
                    return (
                      <article
                        key={item.id}
                        className="rounded-2xl border border-green-200 bg-white p-5 shadow-sm sm:col-span-2"
                      >
                        <div className="mb-5">
                          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-green-700">
                            Editing ingredient
                          </p>

                          <h3 className="mt-1 text-lg font-bold">
                            {item.name}
                          </h3>
                        </div>

                        <form
                          onSubmit={(event) => handleUpdate(event, item.id)}
                          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
                        >
                          <div>
                            <label htmlFor={`edit-name-${item.id}`} className="mb-2 block text-sm font-medium">
                              Ingredient
                            </label>

                            <input
                              id={`edit-name-${item.id}`}
                              type="text"
                              value={editingForm.name}
                              onChange={(event) =>
                                setEditingForm((current) => ({
                                  ...current,
                                  name: event.target.value,
                                }))
                              }
                              required
                              className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                            />
                          </div>

                          <div>
                            <label htmlFor={`edit-quantity-${item.id}`} className="mb-2 block text-sm font-medium">
                              Quantity
                            </label>

                            <input
                              id={`edit-quantity-${item.id}`}
                              type="text"
                              value={editingForm.quantity}
                              onChange={(event) =>
                                setEditingForm((current) => ({
                                  ...current,
                                  quantity: event.target.value,
                                }))
                              }
                              className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                            />
                          </div>

                          <div>
                            <label htmlFor={`edit-unit-${item.id}`} className="mb-2 block text-sm font-medium">
                              Unit
                            </label>

                            <input
                              id={`edit-unit-${item.id}`}
                              type="text"
                              value={editingForm.unit}
                              onChange={(event) =>
                                setEditingForm((current) => ({
                                  ...current,
                                  unit: event.target.value,
                                }))
                              }
                              className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                            />
                          </div>

                          <div>
                            <label htmlFor={`edit-category-${item.id}`} className="mb-2 block text-sm font-medium">
                              Category
                            </label>

                            <input
                              id={`edit-category-${item.id}`}
                              type="text"
                              value={editingForm.category}
                              onChange={(event) =>
                                setEditingForm((current) => ({
                                  ...current,
                                  category: event.target.value,
                                }))
                              }
                              className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                            />
                          </div>

                          <div>
                            <label htmlFor={`edit-storage-${item.id}`} className="mb-2 block text-sm font-medium">
                              Storage
                            </label>

                            <input
                              id={`edit-storage-${item.id}`}
                              type="text"
                              value={editingForm.storage_location}
                              onChange={(event) =>
                                setEditingForm((current) => ({
                                  ...current,
                                  storage_location: event.target.value,
                                }))
                              }
                              className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                            />
                          </div>

                          <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
                            <button
                              type="submit"
                              disabled={saving}
                              className="rounded-xl bg-green-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-800 disabled:opacity-60"
                            >
                              {saving ? "Saving..." : "Save Changes"}
                            </button>

                            <button
                              type="button"
                              onClick={cancelEditing}
                              disabled={saving}
                              className="rounded-xl border border-neutral-300 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-60"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      </article>
                    );
                  }

                  return (
                    <article
                      key={item.id}
                      className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="truncate font-bold text-neutral-950">
                            {item.name}
                          </h3>

                          <p className="mt-1 text-sm text-neutral-500">
                            {item.quantity || "Quantity not specified"}
                            {item.unit ? ` ${item.unit}` : ""}
                          </p>
                        </div>

                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => startEditing(item)}
                            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-green-700 transition hover:bg-green-50"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(item.id)}
                            disabled={deletingId === item.id}
                            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                          >
                            {deletingId === item.id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {item.category && (
                          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
                            {item.category}
                          </span>
                        )}

                        {item.storage_location && (
                          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
                            {item.storage_location}
                          </span>
                        )}
                      </div>

                      {/* STOCK MANAGEMENT */}
                      <div className="mt-5 border-t border-neutral-100 pt-4">
                        <p className="mb-3 text-sm font-semibold text-neutral-700">
                          Manage stock
                        </p>

                        <div className="flex flex-wrap gap-2">
                          <input
                            type="number"
                            min="0.001"
                            step="any"
                            placeholder="Amount"
                            value={stockInputs[item.id]?.amount ?? ""}
                            onChange={(event) =>
                              setStockInputs((current) => ({
                                ...current,
                                [item.id]: {
                                  amount: event.target.value,
                                  unit:
                                    current[item.id]?.unit ?? item.unit ?? "",
                                },
                              }))
                            }
                            className="w-28 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                            aria-label={`Stock amount for ${item.name}`}
                          />

                          <input
                            type="text"
                            placeholder="Unit"
                            value={
                              stockInputs[item.id]?.unit ?? item.unit ?? ""
                            }
                            onChange={(event) =>
                              setStockInputs((current) => ({
                                ...current,
                                [item.id]: {
                                  amount: current[item.id]?.amount ?? "",
                                  unit: event.target.value,
                                },
                              }))
                            }
                            className="w-24 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                            aria-label={`Stock unit for ${item.name}`}
                          />

                          <button
                            type="button"
                            onClick={() => handleStockAdjustment(item, "add")}
                            disabled={adjustingId === item.id}
                            className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
                          >
                            {adjustingId === item.id ? "Updating..." : "+ Add"}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleStockAdjustment(item, "consume")
                            }
                            disabled={adjustingId === item.id}
                            className="rounded-lg border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                          >
                            − Use
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}