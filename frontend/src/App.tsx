import React, { useState } from "react";
import { Routes, Route, Link, NavLink } from "react-router-dom";
import { FilterBar } from "./components/FilterBar";
import { DealsList } from "./components/DealsList";
import BlogList from "./blog/BlogList";
import BlogPost from "./blog/BlogPost";

type Meta = { warehouses: string[]; stores: string[] };

function Home() {
  const [filters, setFilters] = useState<{
    q?: string; wh?: string; store?: string; sort?: any; limit?: number; source?: "sheets"|"banggood"|"aliexpress";
  }>({ wh: "EU", limit: 100, source: "sheets" });
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

export default function App() {
  return (
    <div className="min-h-dvh">
      <header className="px-4 py-3 border-b border-neutral-800 sticky top-0 z-30 bg-neutral-950/80 backdrop-blur">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="font-bold"><Link to="/">kinabolveddmeg</Link></div>
          <nav className="flex gap-4 text-sm">
            <NavLink to="/" className={({isActive}) => isActive ? "text-amber-400" : "text-neutral-400 hover:text-white"}>Kuponok</NavLink>
            <NavLink to="/blog" className={({isActive}) => isActive ? "text-amber-400" : "text-neutral-400 hover:text-white"}>Blog</NavLink>
          </nav>
        </div>
      </header>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/blog" element={<BlogList />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
      </Routes>
    </div>
  );
}
