import React, { useState } from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import { FilterBar } from "./components/FilterBar";
import { DealsList } from "./components/DealsList";
import BlogList from "./blog/BlogList";
import BlogPost from "./blog/BlogPost";

type Filters = {
  q?: string;
  wh?: string;
  store?: string;
  sort?: "price_asc" | "price_desc" | "store_asc" | "store_desc";
  limit?: number;
  source?: "sheets" | "banggood" | "aliexpress";
  catalog?: "1";
};

type Meta = { warehouses: string[]; stores: string[] };

function HomePage() {
  const [filters, setFilters] = useState<Filters>({
    wh: "EU",
    limit: 100,
    source: "sheets",
  });
  const [meta, setMeta] = useState<Meta>({ warehouses: [], stores: [] });

  return (
    <>
      <FilterBar value={filters} onChange={setFilters} meta={meta} />
      <main className="max-w-6xl mx-auto">
        <DealsList filters={filters} onMeta={setMeta} />
      </main>
    </>
  );
}

function NotFound() {
  return <div className="p-6 text-neutral-400">A keresett oldal nem található.</div>;
}

export default function App() {
  return (
    <div className="min-h-dvh">
      <header className="px-4 py-3 border-b border-neutral-800 sticky top-0 z-30 bg-neutral-950/80 backdrop-blur">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <NavLink to="/" className="font-bold hover:text-amber-300 transition">
            kinabolveddmeg
          </NavLink>
          <nav className="flex items-center gap-4 text-sm">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                (isActive ? "text-amber-300" : "text-neutral-400") + " hover:text-amber-200"
              }
            >
              Dealek
            </NavLink>
            <NavLink
              to="/blog"
              className={({ isActive }) =>
                (isActive ? "text-amber-300" : "text-neutral-400") + " hover:text-amber-200"
              }
            >
              Blog
            </NavLink>
            <small className="text-neutral-500">PWA ✓</small>
          </nav>
        </div>
      </header>

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/blog" element={<BlogList />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}
