import React, { useEffect, useState } from "react";
import { FilterBar } from "./components/FilterBar";
import { DealsList } from "./components/DealsList";

type Meta = { warehouses: string[]; stores: string[] };

export default function App() {
  const [filters, setFilters] = useState<{
    q?: string;
    wh?: string;
    store?: string;
    sort?: "price_asc" | "price_desc" | "store_asc" | "store_desc";
    source?: "sheets" | "banggood";
    limit?: number;
  }>({ limit: 100, source: "sheets" });

  const [meta, setMeta] = useState<Meta>({ warehouses: [], stores: [] });

  useEffect(() => {
    const endpoint = filters.source === "banggood" ? "bg" : "coupons";
    const url = `/.netlify/functions/${endpoint}?limit=1&_=${Date.now()}`;
    fetch(url, { headers: { "Cache-Control": "no-cache" } })
      .then(r => r.json())
      .then(d => {
        const m = d?.meta || {};
        setMeta({
          warehouses: Array.isArray(m.warehouses) ? m.warehouses : [],
          stores: Array.isArray(m.stores) ? m.stores : [],
        });
      })
      .catch(() => {});
  }, [filters.source]);

  return (
    <div className="min-h-dvh">
      <header className="px-4 py-3 border-b border-neutral-800">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="font-bold">kinabolveddmeg</div>
          <small className="text-neutral-400">PWA ✓</small>
        </div>
      </header>

      <FilterBar value={filters} onChange={setFilters} meta={meta} />

      <main className="max-w-6xl mx-auto">
        <DealsList filters={filters} />
      </main>
    </div>
  );
}
