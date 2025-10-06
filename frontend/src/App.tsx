import React, { useEffect, useState } from "react";
import { FilterBar } from "./components/FilterBar";
import { DealsList } from "./components/DealsList";
import { AliStrip } from "./components/AliStrip";

type Filters = {
  q?: string;
  wh?: string;
  store?: string; // "Banggood" | "Geekbuying" | "AliExpress"
  sort?: "price_asc" | "price_desc" | "store_asc" | "store_desc";
  limit?: number;
};

export default function App() {
  // indulás: nincs EU-szűrő, hogy tényleg a lapok tetejét lásd
  const [filters, setFilters] = useState<Filters>({ limit: 200 });

  const [meta, setMeta] = useState<{ warehouses: string[]; stores: string[] }>({
    warehouses: [],
    stores: ["Banggood", "Geekbuying", "AliExpress"],
  });

  useEffect(() => {
    // csak a raktárlistához kérünk 1x adatot a sheets-es aggregátortól
    fetch(`/.netlify/functions/coupons?limit=200&_=${Date.now()}`)
      .then((r) => r.json())
      .then((d) => {
        const ws = new Set<string>();
        (d.items || []).forEach((it: any) => { if (it.wh) ws.add(String(it.wh)); });
        setMeta((m) => ({ ...m, warehouses: Array.from(ws).sort() }));
      })
      .catch(() => {});
  }, []);

  const hasActiveFilters =
    (filters.q && filters.q.trim() !== "") ||
    (filters.wh && filters.wh !== "") ||
    (filters.store && filters.store !== "") ||
    (filters.sort && filters.sort !== "");

  const resetFilters = () => setFilters({ limit: 200 });

  return (
    <div className="min-h-dvh">
      <header className="px-4 py-3 border-b border-neutral-800">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="font-bold">kinabolveddmeg</div>
          <small className="text-neutral-400">PWA ✓</small>
        </div>
      </header>

      <FilterBar value={filters} onChange={setFilters} meta={meta} onReset={resetFilters} />

      {/* Főoldali Ali TOP csak akkor, ha nincs aktív szűrő */}
      {!hasActiveFilters && <AliStrip />}

      <main className="max-w-6xl mx-auto">
        <DealsList filters={filters} />
      </main>
    </div>
  );
}
