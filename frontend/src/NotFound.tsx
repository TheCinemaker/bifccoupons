import React from "react";
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="max-w-3xl mx-auto p-8 text-center">
      <div className="text-6xl font-bold mb-2 text-amber-400">404</div>
      <h1 className="text-xl font-semibold mb-2">Az oldal nem található</h1>
      <p className="text-neutral-400 mb-6">A keresett oldal nem létezik, vagy átkerült máshova.</p>
      <Link to="/" className="text-amber-400 hover:underline">← Vissza a főoldalra</Link>
    </div>
  );
}
