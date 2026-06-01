import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FilterBar } from "./components/FilterBar";
import { DealsList } from "./components/DealsList";

type Filters = {
  q?: string;
  wh?: string;
  store?: string;
  sort?: "price_asc" | "price_desc" | "store_asc" | "store_desc";
  limit?: number;
};

export default function App() {
  const [filters, setFilters] = useState<Filters>({ limit: 100 });
  const [meta, setMeta] = useState<{ warehouses: string[]; stores: string[] }>({
    warehouses: [],
    stores: ["Banggood", "Geekbuying", "AliExpress"],
  });

  useEffect(() => {
    fetch("/.netlify/functions/search?limit=200")
      .then((r) => r.json())
      .then((d) => {
        const warehouses: string[] = d?.meta?.warehouses ?? [];
        setMeta((m) => ({ ...m, warehouses }));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-dvh">
      <header className="px-4 py-3 border-b border-neutral-800 sticky top-0 z-30 bg-neutral-950/80 backdrop-blur">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link to="/" className="font-bold">kinabolveddmeg</Link>
          <div className="flex items-center gap-4">
            <Link to="/blog" className="text-sm text-neutral-300 hover:text-white">Blog</Link>
            <small className="text-neutral-400">PWA ✓</small>
          </div>
        </div>
      </header>

      <FilterBar value={filters} onChange={setFilters} meta={meta} />
      <main className="max-w-6xl mx-auto">
        <DealsList filters={filters} />
      </main>
    </div>
  );
}
