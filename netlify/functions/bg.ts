// ... a fájl eleje változatlan ...

export function FilterBar({ value, onChange, meta }: { value: Filters; onChange:(v:Filters)=>void; meta:{warehouses:string[]; stores:string[]} }) {
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  const isBG = value.source === "banggood";

  return (
    <div className="px-4 py-3 flex flex-wrap gap-3 bg-neutral-950/70 backdrop-blur sticky top-0 z-20 border-b border-neutral-800">
      {/* kereső + forrás + wh + store + rendezés ... (ahogy korábban) */}

      {/* Csak BG live esetén: Katalógus fallback engedélyezése */}
      {isBG && (
        <label className="flex items-center gap-2 text-sm text-neutral-200">
          <input
            type="checkbox"
            className="accent-amber-500"
            checked={Boolean((value as any).catalog)}
            onChange={(e) => set({ ...(value as any), catalog: e.target.checked ? "1" : undefined })}
          />
          Nincs kupon? Mutasd a BG találatokat is
        </label>
      )}
    </div>
  );
}
