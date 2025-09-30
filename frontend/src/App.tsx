import React, { useState } from "react";
import { DealsList } from "./components/DealsList";
import { FilterBar } from "./components/FilterBar";

export default function App() {
  const [filters, setFilters] = useState<{ q?: string; wh?: string; limit?: number }>({ wh: "EU", limit: 100 });

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 bg-neutral-950/70 backdrop-blur border-b border-neutral-800">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="font-bold">kinabolveddmeg</div>
          <a href="/manifest.webmanifest" className="text-xs text-neutral-400 hover:text-white">PWA</a>
        </div>
        <FilterBar value={filters} onChange={setFilters} />
      </header>
      <main className="max-w-6xl mx-auto px-4 py-4">
        <DealsList filters={filters} />
      </main>
    </div>
  );
}
