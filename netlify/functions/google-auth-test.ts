import type { Handler } from "@netlify/functions";
import { google } from "googleapis";

const { SPREADSHEET_ID, GOOGLE_APPLICATION_CREDENTIALS_JSON } = process.env;

export const handler: Handler = async () => {
  console.log("--- Google Auth Teszt INDUL ---");

  if (!SPREADSHEET_ID || !GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    const hiba = "!!! HIBA: A SPREADSHEET_ID vagy a GOOGLE_APPLICATION_CREDENTIALS_JSON nincs beállítva a Netlify-on!";
    console.error(hiba);
    return { statusCode: 500, body: hiba };
  }

  try {
    console.log("1. LÉPÉS: A JSON környezeti változó beolvasása...");
    const creds = JSON.parse(GOOGLE_APPLICATION_CREDENTIALS_JSON);
    console.log("   - SIKER. A robot email címe:", creds.client_email);
    
    console.log("2. LÉPÉS: A privát kulcs javítása a sortörésekhez...");
    const privateKey = creds.private_key.replace(/\\n/g, '\n');
    console.log("   - SIKER. A kulcs javítva. (Nem írom ki a biztonság kedvéért)");

    console.log("3. LÉPÉS: Google JWT kliens létrehozása a javított kulccsal...");
    const jwt = new google.auth.JWT(
      creds.client_email,
      undefined,
      privateKey,
      ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    );
    console.log("   - SIKER. A JWT kliens létrejött.");

    console.log("4. LÉPÉS: Google Sheets API kliens létrehozása...");
    const sheets = google.sheets({ version: "v4", auth: jwt });
    console.log("   - SIKER. Az API kliens létrejött.");

    console.log("5. LÉPÉS: TESZT API HÍVÁS INDUL (csak a táblázat nevét kérem le)...");
    const response = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    console.log("   - SIKER! AZ API HÍVÁS VÁLASZOLT! A táblázat neve:", response.data.properties?.title);

    const sikerUzenet = "--- A Google authentikáció SIKERES! A hiba a 'coupons.ts' fájlban van. ---";
    console.log(sikerUzenet);
    return {
      statusCode: 200,
      body: sikerUzenet,
    };

  } catch (error: any) {
    const hibaUzenet = "--- A Google authentikáció SIKERTELEN! A hiba a GOOGLE_APPLICATION_CREDENTIALS_JSON kulcsban van. ---";
    console.error(hibaUzenet);
    console.error("A Google konkrét hibaüzenete:", error.message);
    if (error.response?.data?.error) {
        console.error("Részletek:", JSON.stringify(error.response.data.error, null, 2));
    }
    return {
      statusCode: 500,
      body: `${hibaUzenet}\n\nHiba: ${error.message}`,
    };
  }
};
