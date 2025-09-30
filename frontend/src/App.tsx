import React, { useState } from "react";
import { FilterBar } from "./components/FilterBar";
import { DealsList } from "./components/DealsList";

export default function App() {
  const [filters, setFilters] = useState<{ q?: string; wh?: string; limit?: number }>({ wh: "EU", limit: 100 });
  return (
    <div className="min-h-dvh">
      <header className="px-4 py-3 border-b border-neutral-800">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="font-bold">kinabolveddmeg</div>
          <small className="text-neutral-400">PWA ✓</small>
        </div>
      </header>
      <FilterBar value={filters} onChange={setFilters} />
      <main className="max-w-6xl mx-auto">
        <DealsList filters={filters} />
      </main>
    </div>
  );
}
