# KÍNÁBÓL VEDD MEG (BIFC) - Projekt Összefoglaló & Állapotmentés

Ez a dokumentum rögzíti a bifc_2 projekt jelenlegi teljes állapotát.

---

## Repository & Telepítési Beállítások

- **GitHub Repository**: `https://github.com/TheCinemaker/bifccoupons`
- **Aktív Ág**: `main`
- **Netlify Konfiguráció**:
  - `netlify.toml` (gyökér) és `frontend/netlify.toml` beállítva (`publish = "frontend/build"`).
  - `frontend/.env` fájl tartalmazza: `CI=false` és `GENERATE_SOURCEMAP=false`.

---

## Élő Google Sheets Integráció & 9 Oszlopos Séma

- **Spreadsheet ID**: `1qw3IXBpWlRx-ZFSueFaiPfA44lpMd1b5-MhnSIRwzMc`
- **Szigorú 9 Oszlopos Egységes Szerkezet**:
  `image` | `name` | `link` | `price` | `code` | `warehouse` | `endTime` | `updateTime` | `shortlink`
- **Beolvasott Laptáblák**:
  1. `BG Unique` (~498 db)
  2. `BG Unique HUN` (~499 db)
  3. `BG ALL Coupons` (Banggood API élő szinkronizált lista)
  4. `AliExpress ALL` (AliExpress Affiliate API élő szinkronizált lista)
  5. `Geekbuying` (~1201 db)
  6. `Geekbuying Unique` (~214 db)
- **Dinamikus Oszlopdetektálás**: A frontend automatikusan felismeri a 9 oszlopos sémát és a korábbi formátumokat is a zökkenőmentes beolvasásért.

---

## Banggood CDN 403 Képhiba Javítás & Sebesség

- `<meta name="referrer" content="no-referrer" />` és `referrerPolicy="no-referrer"` beállítva az `index.html`-ben és az `<img>` elemeken a Banggood 403 Hotlinking tiltás megszüntetésére.
- Tördelés és Laptördelés (Pagination) beállítva: Kezdeti 36 elem renderelése instant betöltéssel + "További kuponok betöltése" gomb.

---

## Deal Studio (Facebook Posztolási Munkafolyamat)

- Az Árukereső / Árgép elemek teljesen el lettek távolítva.
- **Fő Posztszöveg**: Terméknév, Kuponos ár, Kuponkód, Raktár, hivatkozás az első kommentre.
- **Első Komment**: Közvetlen affiliate vásárlási link.
- **Termékkép**: Ármatricás fotó előnézet (`[Kép Másolása Vágólapra]` & `[Kép Letöltése HD PNG-ben]`).

---

## Automatizáció (Óránkénti Szinkronizálások)

- **Banggood Sync**: `backend/syncBanggood.js` és `.github/workflows/banggood_sync.yml` (`cron: '0 * * * *'`).
- **AliExpress Sync**: `backend/syncAliExpress.js` és `.github/workflows/aliexpress_sync.yml` (`cron: '5 * * * *'`).
  - Mindkét modul felülírásos/frissítéses tisztítást végez a duplikációk megelőzésére.
  - Szigorú 9 oszlopos sémát írnak a saját lapjaikra (`BG ALL Coupons` és `AliExpress ALL`).

---

## Szabályok

- `.agents/AGENTS.md` elmentve: **Szigorúan NO EMOJI** a felületen, a kódokban és a válaszokban.
