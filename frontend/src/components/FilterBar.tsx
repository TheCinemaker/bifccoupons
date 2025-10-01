import React from "react";

type Filters = {
  q?: string;
  wh?: string;
  store?: string;
  sort?: "price_asc" | "price_desc" | "store_asc" | "store_desc";
  source?: "sheets" | "banggood";
  limit?: number;
};

export function FilterBar({
  value,
  onChange,
  meta,
}: {
  value: Filters;
  onChange: (v: Filters) => void;
  meta: { warehouses: string[]; stores: string[] };
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });

  const isBG = value.source === "banggood";

  return (
    <div className="px-4 py-3 flex flex-wrap gap-2 bg-neutral-950/70 backdrop-blur sticky top-0 z-20 border-b border-neutral-800">
      <input
        className="px-3 py-2 rounded bg-neutral-900 text-white w-full sm:max-w-xs"
        placeholder="Keresés… (pl. BlitzWolf, robot)"
        value={value.q || ""}
        onChange={(e) => set({ q: e.target.value })}
      />

      {/* Forrás */}
      <select
        className="px-3 py-2 rounded bg-neutral-900 text-white"
        value={value.source || "sheets"}
        onChange={(e) => set({ source: (e.target.value as Filters["source"]) || "sheets", wh: undefined, store: undefined })}
        title="Adatforrás"
      >
        <option value="sheets">Összesített (Sheets)</option>
        <option value="banggood">Banggood Live</option>
      </select>

      {/* Warehouse – a választott forrás meta.warehouses listából */}
      <select
        className="px-3 py-2 rounded bg-neutral-900 text-white"
        value={value.wh || ""}
        onChange={(e) => set({ wh: e.target.value || undefined })}
      >
        <option value="">Minden raktár</option>
        {meta.warehouses.map((w) => (
          <option key={w} value={w}>{w}</option>
        ))}
      </select>

      {/* Store – csak Sheets-nél van értelme (BG live = fix Banggood) */}
      <select
        className="px-3 py-2 rounded bg-neutral-900 text-white disabled:opacity-50"
        value={value.store || ""}
        onChange={(e) => set({ store: e.target.value || undefined })}
        disabled={isBG}
        title={isBG ? "Banggood Live esetén csak Banggood" : "Bolt szűrő"}
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
        <option value="">Alap (okos rangsor)</option>
        <option value="price_asc">Ár szerint ↑</option>
        <option value="price_desc">Ár szerint ↓</option>
        <option value="store_asc">Bolt (A→Z)</option>
        <option value="store_desc">Bolt (Z→A)</option>
      </select>
    </div>
  );
}
