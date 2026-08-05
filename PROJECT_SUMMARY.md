# 🚀 KÍNÁBÓL VEDD MEG (BIFC) - Projekt Összefoglaló & Állapotmentés

Ez a dokumentum rögzíti a bifc_2 projekt jelenlegi teljes állapotát a más munkára történő átállás előtt.

---

## 📌 Repository & Telepítési Beállítások

- **GitHub Repository**: `https://github.com/TheCinemaker/bifccoupons`
- **Aktív Ág**: `main` (Legfrissebb commit: `5c21c83`)
- **Netlify Konfiguráció**:
  - `netlify.toml` (gyökér) és `frontend/netlify.toml` beállítva (`publish = "frontend/build"`).
  - `frontend/.env` fájl tartalmazza: `CI=false` és `GENERATE_SOURCEMAP=false`.

---

## 📊 Élő Google Sheets Integráció

- **Spreadsheet ID**: `1qw3IXBpWlRx-ZFSueFaiPfA44lpMd1b5-MhnSIRwzMc`
- **Beolvasott Laptáblák (több mint 4 400 élő termék)**:
  1. `BG Unique` (~498 db)
  2. `BG Unique HUN` (~499 db)
  3. `BG ALL Coupons` (~2009 db)
  4. `Geekbuying` (~1201 db)
  5. `Geekbuying Unique` (~214 db)
- **Zero Mintaadat**: A kódban semmilyen demo adat nincs. A rendszer közvetlenül a Google Sheets GViz JSON csatornáján keresztül tölti le az élő adatokat párhuzamosan (`Promise.allSettled`).

---

## 🖼️ Banggood CDN 403 Képhiba Javítás & Sebesség

- `<meta name="referrer" content="no-referrer" />` és `referrerPolicy="no-referrer"` beállítva az `index.html`-ben és az `<img>` elemeken a Banggood 403 Hotlinking tiltás megszüntetésére.
- Tördelés és Laptördelés (Pagination) beállítva: Kezdeti 36 elem renderelése instant betöltéssel + "További kuponok betöltése" gomb.

---

## ⚡ Deal Studio (Facebook Posztolási Munkafolyamat)

- Az Árukereső / Árgép elemek teljesen el lettek távolítva.
- **Fő Posztszöveg**: Terméknév, Kuponos ár, Kuponkód, Raktár, hivatkozás az első kommentre (`[Fő Posztszöveg Másolása]`).
- **Első Komment**: Közvetlen affiliate vásárlási link (`[Első Komment Másolása]`).
- **Termékkép**: Ármatricás fotó előnézet (`[Kép Másolása Vágólapra]` & `[Kép Letöltése HD PNG-ben]`).

---

## 🔄 Automatizáció (Napi Banggood Szinkron)

- `backend/syncBanggood.js` és `.github/workflows/banggood_sync.yml` létrehozva a napi Banggood API kuponok Google Sheets-be történő automatikus szinkronizálására minden nap 04:00 UTC-kor.

---

## 📜 Szabályok

- `.agents/AGENTS.md` elmentve: **Szigorúan NO EMOJI** a felületen, a kódokban és a válaszokban.
