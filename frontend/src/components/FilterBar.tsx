import React from "react";

type Filters = {
  q?: string;
  wh?: string;
  store?: string;
  sort?: "price_asc" | "price_desc" | "store_asc" | "store_desc";
  limit?: number;
};

export function FilterBar({
  value, onChange, meta, onReset,
}:{
  value: Filters;
  onChange: (v: Filters) => void;
  meta: { warehouses: string[]; stores: string[] };
  onReset?: () => void;
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });

  const hasActiveFilters =
    (value.wh && value.wh !== "") ||
    (value.store && value.store !== "") ||
    (value.sort && value.sort !== "") ||
    (value.q && value.q.trim() !== "");

  // Ali-nál nincs raktárszűrő értelme
  const isAli = (value.store || "").toLowerCase() === "aliexpress";

  return (
    <div className="px-4 py-3 flex flex-wrap gap-3 bg-neutral-950/70 backdrop-blur sticky top-0 z-20 border-b border-neutral-800">
      <input
        className="px-3 py-2 rounded bg-neutral-900 text-white w-full sm:max-w-sm"
        placeholder="Keresés… (pl. BlitzWolf, robot, kukirin g2)"
        value={value.q || ""}
        onChange={(e) => set({ q: e.target.value })}
      />

      {/* Raktár */}
      <select
        className="px-3 py-2 rounded bg-neutral-900 text-white disabled:opacity-50"
        value={value.wh || ""}
        onChange={(e) => set({ wh: e.target.value || undefined })}
        disabled={isAli}
        title={isAli ? "AliExpress esetén nem elérhető" : "Raktár"}
      >
        <option value="">Minden raktár</option>
        {meta.warehouses.map((w) => (
          <option key={w} value={w}>{w}</option>
        ))}
      </select>

      {/* Bolt */}
      <select
        className="px-3 py-2 rounded bg-neutral-900 text-white"
        value={value.store || ""}
        onChange={(e) => set({ store: e.target.value || undefined, wh: undefined })}
        title="Bolt"
      >
        <option value="">Minden bolt</option>
        {meta.stores.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {/* Rendezés */}
      <select
        className="px-3 py-2 rounded bg-neutral-900 text-white"
        value={value.sort || ""}
        onChange={(e) => set({ sort: (e.target.value as Filters["sort"]) || undefined })}
        title="Rendezés"
      >
        <option value="">Alap</option>
        <option value="price_asc">Ár szerint ↑</option>
        <option value="price_desc">Ár szerint ↓</option>
        <option value="store_asc">Bolt (A→Z)</option>
        <option value="store_desc">Bolt (Z→A)</option>
      </select>

      {onReset && hasActiveFilters && (
        <button
          className="px-3 py-2 rounded bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
          onClick={onReset}
          title="Szűrők törlése"
        >
          Szűrők törlése
        </button>
      )}
    </div>
  );
}
