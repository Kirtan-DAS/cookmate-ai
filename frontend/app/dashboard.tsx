"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface PantryItem {
  id: number;
  name: string;
  quantity?: string;
  unit?: string;
  category?: string;
  storage_location?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [items, setItems] = useState<PantryItem[]>([]);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchPantry();
  }, []);

  const getAuthToken = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.push("/login");
      return null;
    }
    return data.session.access_token;
  };

  const fetchPantry = async () => {
    setLoading(true);
    const token = await getAuthToken();
    if (!token) return;

    try {
      const res = await fetch("http://127.0.0.1:8000/api/pantry/", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch (err) {
      console.error("Failed to fetch pantry:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setAdding(true);
    const token = await getAuthToken();
    if (!token) return;

    try {
      const res = await fetch("http://127.0.0.1:8000/api/pantry/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          quantity: quantity.trim() || undefined,
          unit: unit.trim() || undefined,
          category: category.trim() || undefined,
        }),
      });

      if (res.ok) {
        setName("");
        setQuantity("");
        setUnit("");
        setCategory("");
        fetchPantry();
      }
    } catch (err) {
      console.error("Failed to add item:", err);
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteItem = async (id: number) => {
    const token = await getAuthToken();
    if (!token) return;

    try {
      const res = await fetch(`http://127.0.0.1:8000/api/pantry/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete item:", err);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">CookMate Dashboard</h1>
            <p className="text-sm text-gray-500">Manage your pantry items</p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            Log out
          </button>
        </div>

        {/* Add Item Form */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Add Pantry Item</h2>
          <form onSubmit={handleAddItem} className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <input
              type="text"
              placeholder="Item name (e.g. Milk)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="rounded-lg border border-gray-200 p-2.5 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Quantity (e.g. 2)"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="rounded-lg border border-gray-200 p-2.5 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Unit (e.g. Liters)"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="rounded-lg border border-gray-200 p-2.5 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Category (e.g. Dairy)"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-lg border border-gray-200 p-2.5 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={adding}
              className="bg-emerald-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {adding ? "Adding..." : "Add Item"}
            </button>
          </form>
        </div>

        {/* Pantry Items List */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Your Pantry</h2>
          {loading ? (
            <p className="text-sm text-gray-500">Loading pantry items...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-gray-500">Your pantry is empty. Add your first item above!</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{item.name}</h3>
                    <p className="text-xs text-gray-500">
                      {item.quantity && `${item.quantity} `}
                      {item.unit && `${item.unit} `}
                      {item.category && `• ${item.category}`}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    className="text-xs text-red-600 hover:text-red-800 font-medium"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}