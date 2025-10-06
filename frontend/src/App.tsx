import React, { useState } from "react";
import { Routes, Route, Link, NavLink } from "react-router-dom";
import { FilterBar } from "./components/FilterBar";
import { DealsList } from "./components/DealsList";
import BlogList from "./blog/BlogList";
import BlogPost from "./blog/BlogPost";

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
  return (
    <div className="min-h-dvh">
      <header className="px-4 py-3 border-b border-neutral-800 sticky top-0 z-30 bg-neutral-950/80 backdrop-blur">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <Link to="/" className="font-bold text-white">kinabolveddmeg</Link>
          <nav className="flex items-center gap-4 text-sm">
            <NavLink to="/" end className={({isActive}) => isActive ? "text-amber-300" : "text-neutral-300 hover:text-white"}>Dealek</NavLink>
            <NavLink to="/blog" className={({isActive}) => isActive ? "text-amber-300" : "text-neutral-300 hover:text-white"}>Blog</NavLink>
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
