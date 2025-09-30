import React from "react";

export function FilterBar({ value, onChange }:{ value:any; onChange:(v:any)=>void }) {
  return (
    <div className="px-4 py-3 flex gap-2 bg-neutral-950/70 backdrop-blur sticky top-0 z-20 border-b border-neutral-800">
      <input
        className="px-3 py-2 rounded bg-neutral-900 text-white w-full max-w-sm"
        placeholder="Keresés… (pl. BlitzWolf, robot)"
        value={value.q || ""}
        onChange={(e) => onChange({ ...value, q: e.target.value })}
      />
      <select
        className="px-3 py-2 rounded bg-neutral-900 text-white"
        value={value.wh || ""}
        onChange={(e) => onChange({ ...value, wh: e.target.value })}
      >
        <option value="">Minden raktár</option>
        <option value="EU">EU</option>
        <option value="PL">PL</option>
        <option value="CZ">CZ</option>
        <option value="ES">ES</option>
        <option value="CN">CN</option>
      </select>
    </div>
  );
}
