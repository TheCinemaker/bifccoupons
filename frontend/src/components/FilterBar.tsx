import React from "react";

export type Filters = {
  q?: string;
  wh?: string;
  store?: string;
  sort?: "price_asc" | "price_desc" | "store_asc" | "store_desc";
  source?: "sheets" | "banggood" | "aliexpress";
  limit?: number;
  catalog?: "1"; // csak BG live-hoz (ha nincs kupon, mutassa a keresés-linket)
};

type Meta = { warehouses: string[]; stores: string[] };

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export function FilterBar({
  value,
  onChange,
  meta,
}: {
  value: Filters;
  onChange: (v: Filters) => void;
  meta?: Meta; // opcionális: biztonság kedvéért
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });

  // Forrás (adat-proxy) — default: sheets
  const source = value.source || "sheets";
  const isBG = source === "banggood";
  const isAli = source === "aliexpress";

  // Raktár- és boltválaszték a meta-ból (ha még nincs meta, üres tömb)
  const warehouses = dedupe(meta?.warehouses ?? []).sort((a, b) =>
    String(a).localeCompare(String(b))
  );

  // A Sheets meta-ból jön “Banggood”, “Geekbuying” — toldjuk meg “AliExpress”-szel, és dedupe.
  const storeOptions = dedupe([...(meta?.stores ?? []), "AliExpress"]).sort(
    (a, b) => a.localeCompare(b)
  );

  // Forrásváltáskor érdemes a store-t illeszteni a logikához
  function handleSourceChange(next: Filters["source"]) {
    // állítsuk a boltot is ésszerű alapra
    const nextStore =
      next === "banggood" ? "Banggood" : next === "aliexpress" ? "AliExpress" : undefined;
    set({ source: next, store: nextStore });
  }

  // Gyors reset
  function clearAll() {
    onChange({
      source: value.source ?? "sheets",
      limit: value.limit ?? 100,
    });
  }

  return (
    <div className="px-4 py-3 flex flex-wrap gap-2 bg-neutral-950/70 backdrop-blur sticky top-0 z-20 border-b border-neutral-800">
      {/* Kereső */}
      <input
        className="px-3 py-2 rounded bg-neutral-900 text-white w-full sm:max-w-xs"
        placeholder="Keresés… (pl. kukirin, blitzwolf, robot)"
        value={value.q || ""}
        onChange={(e) => set({ q: e.target.value })}
        aria-label="Keresés"
      />

      {/* Adatforrás */}
      <select
        className="px-3 py-2 rounded bg-neutral-900 text-white"
        value={source}
        onChange={(e) => handleSourceChange(e.target.value as Filters["source"])}
        title="Adatforrás"
        aria-label="Adatforrás"
      >
        <option value="sheets">Összesített (Sheets)</option>
        <option value="banggood">Banggood Live</option>
        <option value="aliexpress">AliExpress Live</option>
      </select>

      {/* Raktár (J oszlop) — meta-ból */}
      <select
        className="px-3 py-2 rounded bg-neutral-900 text-white"
        value={value.wh || ""}
        onChange={(e) => set({ wh: e.target.value || undefined })}
        aria-label="Raktár"
      >
        <option value="">Minden raktár</option>
        {warehouses.map((w) => (
          <option key={w} value={w}>
            {w}
          </option>
        ))}
      </select>

      {/* Bolt szűrő — Sheets esetén: Banggood/Geekbuying (+AliExpress), BG live: fix Banggood, Ali live: fix AliExpress */}
      <select
        className="px-3 py-2 rounded bg-neutral-900 text-white disabled:opacity-50"
        value={value.store || ""}
        onChange={(e) => set({ store: e.target.value || undefined })}
        disabled={isBG || isAli}
        title={isBG ? "Banggood Live esetén a bolt fix: Banggood" : isAli ? "AliExpress Live esetén a bolt fix: AliExpress" : "Bolt szűrő"}
        aria-label="Bolt"
      >
        <option value="">Minden bolt</option>
        {storeOptions.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      {/* Rendezés */}
      <select
        className="px-3 py-2 rounded bg-neutral-900 text-white"
        value={value.sort || ""}
        onChange={(e) => set({ sort: (e.target.value as Filters["sort"]) || undefined })}
        title="Rendezés"
        aria-label="Rendezés"
      >
        <option value="">Alap (okos rangsor)</option>
        <option value="price_asc">Ár szerint ↑</option>
        <option value="price_desc">Ár szerint ↓</option>
        <option value="store_asc">Bolt (A→Z)</option>
        <option value="store_desc">Bolt (Z→A)</option>
      </select>

      {/* BG speciális: nincs kupon? mutasd a BG találatokat is */}
      {isBG && (
        <label className="ml-2 inline-flex items-center gap-2 text-sm text-neutral-200">
          <input
            type="checkbox"
            className="accent-amber-500"
            checked={value.catalog === "1"}
            onChange={(e) => set({ catalog: e.target.checked ? "1" : undefined })}
          />
          Nincs kupon? Mutasd a BG találatokat is
        </label>
      )}

      {/* Gyors törlés */}
      <button
        className="ml-auto px-3 py-2 rounded bg-neutral-800 text-neutral-200 hover:bg-neutral-700 border border-neutral-700"
        onClick={clearAll}
        type="button"
      >
        Szűrők törlése
      </button>
    </div>
  );
}
