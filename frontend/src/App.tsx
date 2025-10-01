import React, { useEffect, useState } from "react";
import { FilterBar } from "./components/FilterBar";
import { DealsList } from "./components/DealsList";

type Meta = { warehouses: string[]; stores: string[] };

export default function App() {
  // Szűrők: alapból ne legyen előre beállított WH (csak a táblából jövőkből választhatunk)
  const [filters, setFilters] = useState<{
    q?: string;
    wh?: string;
    store?: string;
    sort?: "price_asc" | "price_desc" | "store_asc" | "store_desc";
    limit?: number;
  }>({ limit: 100 });

  const [meta, setMeta] = useState<Meta>({ warehouses: [], stores: [] });

  // Meta (lenyílók) lekérése – nagyon olcsó: limit=1 elég
  useEffect(() => {
    const url = `/.netlify/functions/coupons?limit=1&_=${Date.now()}`;
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
  }, []);

  return (
    <div className="min-h-dvh">
      <header className="px-4 py-3 border-b border-neutral-800">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="font-bold">kinabolveddmeg kuponkereső</div>
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
