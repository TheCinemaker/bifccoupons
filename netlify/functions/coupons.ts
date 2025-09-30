import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import axios from "axios";
import { google } from "googleapis";

// A segédfüggvények változatlanok
type Deal = { id: string; src: "banggood" | "sheets"; title: string; image?: string; url: string; };
const { SPREADSHEET_ID, GOOGLE_APPLICATION_CREDENTIALS_JSON } = process.env;
function extractImageUrl(raw: any): string | undefined {
  if (!raw) return undefined; let s = String(raw).trim(); if (!s) return undefined;
  const formulaMatch = s.match(/image\s*\(\s*["']([^"']+)["']/i);
  if (formulaMatch?.[1]) return formulaMatch[1]; if (s.startsWith("http")) return s;
  return undefined;
}

// ===================================================================
// ================ ATOMBIZTOS TESZT FÜGGVÉNY ========================
// ===================================================================
async function fetchSheetsDeals(): Promise<Deal[]> {
  if (!SPREADSHEET_ID || !GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    console.error("!!! HIBA: Hiányzó SPREADSHEET_ID vagy GOOGLE_APPLICATION_CREDENTIALS_JSON");
    return [];
  }
  
  console.log(">>> TESZT INDUL: fetchSheetsDeals elindult.");

  try {
    const creds = JSON.parse(GOOGLE_APPLICATION_CREDENTIALS_JSON!);
    const jwt = new google.auth.JWT(
      creds.client_email, undefined, creds.private_key,
      ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    );
    const sheets = google.sheets({ version: "v4", auth: jwt });

    const testRanges = ["'BG Unique'!A1:B10", "'BG Unique HUN'!A1:B10"];
    console.log(">>> TESZT: Google JWT token létrehozva. API hívás indul a következő minimalizált tartományokra:", testRanges);
    
    const resp = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: SPREADSHEET_ID!,
      ranges: testRanges, // Csak az első 10 sort kérjük le!
    });

    console.log(">>> TESZT: Google API VÁLASZOLT! Nincs timeout.");

    const out: Deal[] = [];
    const valueRanges = resp.data.valueRanges;
    if (!valueRanges || valueRanges.length === 0) {
      console.log(">>> TESZT: A Google API nem adott vissza 'valueRanges' adatot.");
      return [];
    }

    for (const vr of valueRanges) {
      const rows = vr.values || [];
      console.log(`>>> TESZT: Munkalap '${vr.range}' feldolgozása. Sorok száma: ${rows.length}`);
      
      if (rows.length < 2) continue;

      console.log(`>>> TESZT: Fejléc: [${rows[0].join(", ")}]`);

      // Ciklus a 2. sortól (index 1)
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row) continue;

        // Keményen kódolt indexek: A=0, B=1
        const imageRaw = row[0];
        const titleRaw = row[1];
        const linkRaw = row[2] || "#"; // Tegyük fel, a link a C oszlop

        console.log(`>>> TESZT: Sor ${r + 1} | Nyers A oszlop: "${imageRaw}" | Nyers B oszlop: "${titleRaw}"`);
        
        const imageUrl = extractImageUrl(imageRaw);
        
        if (titleRaw) {
           out.push({
              id: `sheets:${r}`,
              src: "sheets",
              title: String(titleRaw),
              image: imageUrl,
              url: String(linkRaw),
           });
        }
      }
    }
    
    console.log(`>>> TESZT KÉSZ. Talált elemek száma: ${out.length}. Ha ez 0, a táblázat üres vagy a cím hiányzik.`);
    return out;

  } catch (error: any) {
    console.error("!!! KRITIKUS HIBA a fetchSheetsDeals közben !!!");
    console.error("Hibaüzenet:", error.message);
    if (error.response?.data?.error) {
        console.error("Google API hiba részletei:", JSON.stringify(error.response.data.error, null, 2));
    }
    return [];
  }
}

// A handler csak a teszt függvényt hívja, a Banggood részt kikapcsoltam.
export const handler: Handler = async () => {
  console.log(">>> TESZT: Handler elindult.");
  const items = await fetchSheetsDeals();
  const payload = { count: items.length, items: items };
  console.log(`>>> TESZT: Handler lefutott, ${items.length} elemet ad vissza.`);
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  };
};
