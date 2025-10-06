import React, { useState } from "react";
import { Routes, Route, Link, NavLink } from "react-router-dom";
import { FilterBar } from "./components/FilterBar";
import { DealsList } from "./components/DealsList";
import BlogList from "./blog/BlogList";
import BlogPost from "./blog/BlogPost";

type Meta = { warehouses: string[]; stores: string[] };

function Home() {
  const [filters, setFilters] = useState<{ q?: string; wh?: string; store?: string; sort?: string; limit?: number }>({ wh: "EU", limit: 100 });
  return (
    <>
      <FilterBar value={filters} onChange={setFilters} />
      <main className="max-w-6xl mx-auto">
        <DealsList filters={filters} />
      </main>
    </>
  );
}

export default function App() {
  const [filters, setFilters] = useState<{ q?: string; wh?: string; store?: string; sort?: string; limit?: number; source?: "sheets"|"banggood"|"aliexpress"; catalog?: "1" }>({ wh: "EU", limit: 100, source: "sheets" });
  const [meta, setMeta] = useState<Meta>({ warehouses: [], stores: [] });

  return (
    <div className="min-h-dvh">
      <header className="px-4 py-3 border-b border-neutral-800 sticky top-0 z-30 bg-neutral-950/80 backdrop-blur">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="font-bold">kinabolveddmeg</div>
          <small className="text-neutral-400">PWA ✓</small>
        </div>
      </header>

      <FilterBar value={filters} onChange={setFilters} meta={meta} />
      <main className="max-w-6xl mx-auto">
        <DealsList filters={filters} onMeta={setMeta} />
      </main>
    </div>
  );
}
