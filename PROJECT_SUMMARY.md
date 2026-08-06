# KÍNÁBÓLVEDDMEG (BIFC) - Projekt Összefoglaló & Teljes Állapotmentés

Ez a dokumentum rögzíti a KÍNÁBÓLVEDDMEG (bifc_2) projekt teljes éles és fejlesztési állapotát.

---

## 1. Repository & Élesítési Beállítások

- **GitHub Repository**: `https://github.com/TheCinemaker/bifccoupons`
- **Aktív Ág**: `main` (minden módosítás és build tisztán élesítve)
- **Élesítési Platform**: Netlify (automatikus GitHub CI/CD build)
- **Netlify Konfiguráció**:
  - `netlify.toml` (gyökér) és `frontend/netlify.toml` (`publish = "frontend/build"`).
  - `frontend/.env` fájl: `CI=false` és `GENERATE_SOURCEMAP=false`.
- **Projekt Szabályok (`.agents/AGENTS.md`)**:
  - **Szigorú NO EMOJI szabály**: Semmilyen emoji nem használható a felületen, gombokon, kódban vagy válaszokban.
  - **Szigorú Márkanév Formátum**: A márkanév kizárólag **KÍNÁBÓLVEDDMEG** (vagy **KINABOLVEDDMEG**) egybeírt formában szerepelhet mindenhol.

---

## 2. Élő Google Sheets Integráció

- **Spreadsheet ID**: `1qw3IXBpWlRx-ZFSueFaiPfA44lpMd1b5-MhnSIRwzMc`
- **Aktív Laptáblák (sorrendben)**:
  1. `BANGGOODAPI` (Banggood API élő szinkronizált lista)
  2. `ALIEXPRESSAPI` (AliExpress Affiliate API élő szinkronizált lista)
  3. `BG Unique HUN` (~499 db)
  4. `BG Unique` (~498 db)
  5. `Geekbuying` (~1201 db)
  6. `Geekbuying Unique` (~214 db)
- **Duplikáció Elleni Hash Tracking**:
  - `Hash Tracking` lap (jelenleg ~33 746 eltárolt bejegyzés).
  - SHA-256 kompozit kulcs (`link + kupon + bolt`) és 5 napos cooldown védelem.

---

## 3. Telegram Posztoló Robot (`telegram_bot/`)

- **Fájlok**: [google_apps_script.js](file:///c:/Users/Szilveszter/.gemini/antigravity-ide/scratch/bifc_2/telegram_bot/google_apps_script.js) és [bot.js](file:///c:/Users/Szilveszter/.gemini/antigravity-ide/scratch/bifc_2/telegram_bot/bot.js).
- **Koppintásra Másolható Kuponkód**: Telegram HTML `<code>...</code>` megvalósítás (1 koppintásra azonnal vágólapra másolható a kód).
- **Kettős In-line Gombok**:
  - `[ Vásárlás / Irány a Bolt ]` -> Közvetlen affiliált hivatkozás
  - `[ KINABOLVEDDMEG Összes Kupon ]` -> Hivatkozás a weboldalra
- **Boltváltozatosság (Round-Robin)**: `MAX_POSTS_PER_SHEET = 1` beállítással minden futáskor vegyesen posztol az AliExpress, Banggood és Geekbuying lapokról.

---

## 4. Frontend & Mobil UX Fejlesztések (`frontend/src/`)

- **Kuponkártyák & Mobil Elrendezés (`Coupons.css`)**:
  - Mobilon (`< 620px`) tágas, **1-oszlopos kártyarács** (`grid-template-columns: 1fr`).
  - Nincs többé levágott szöveg, takarás vagy törött árazás.
- **Kattintásra Megnyíló Termék Részletek Modal (`DealDetailModal`)**:
  - Kártyára kattintva megnyíló letisztult modal ablak.
  - **1-Koppintásos Óriás Kuponkód Másoló Gomb**: `Kuponkód másolása: [KÓD]`, mely koppintásra zöld visszajelzést ad (`Kuponkód másolva a vágólapra!`).
  - Direct Vásárlás Gomb: `Irány a bolt (Vásárlás)`.
- **Frissítési Időpont Megjelenítés**:
  - A kuponkereső rács tetején zöld jelvény mutatja az élő adatok frissülési idejét: **`Frissítve: [időpont]`**.
- **Rejtett Admin Belépés**:
  - A **KÍNÁBÓLVEDDMEG** márkanévre 3 másodpercig nyomva tartva vagy tripla kattintással nyílik az Admin PIN ablak (`0169`).

---

## 5. Deal Studio (Facebook Poszt Generátor)

- **Magyar Ékezetes Szövegkimenetek**:
  - `AKCIÓS AJÁNLAT!`, `Termék:`, `Akciós Ár:`, `Kuponkód:`, `Raktár:`, `A vásárlási linket az első kommentben találod!`.
- **3 Kimásolható Mező**:
  1. `Fő Facebook posztszöveg` (kép mellé)
  2. `Első komment` (vásárlási link)
  3. `Teljes poszt + link egyben` (ha egyetlen kommentbe vagy posztba kerül)
- **Canvas Képgenerálás**: HD PNG letöltés és 1-kattintásos vágólapra másolás.

---

## 6. Automatizációk & API Integrációk

- **Banggood Sync**: `backend/syncBanggood.js` és `.github/workflows/banggood_sync.yml`.
- **AliExpress Sync**: `backend/syncAliExpress.js` és `.github/workflows/aliexpress_sync.yml`.
- **AliExpress Link Rövidítés**: `aliexpress.affiliate.link.generate` (vagy shortlink) hivatalos rövid affiliált hivatkozás támogatás.
