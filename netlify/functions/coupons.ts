import type { Handler } from "@netlify/functions";
import crypto from "crypto";

type Deal = {
  id: string;
  src: string;
  title: string;
  image?: string;
  url: string;
  short?: string;
  price?: number;
  orig?: number;
  cur?: string;
  code?: string;
  wh?: string;
  end?: string;
  updated?: string;
  tags?: string[];
};

let LAST_JSON = "";
let LAST_ETAG = "";

function etagOf(json: string) {
  return crypto.createHash("md5").update(json).digest("hex");
}

async function fetchDealsCanonical(_qs: URLSearchParams): Promise<Deal[]> {
  // TODO: később: Ali/BG/Sheets → canonical map
  return [
    {
      id: "demo-1",
      src: "banggood",
      title: "BlitzWolf BW-XYZ 65W GaN töltő",
      url: "https://example.com",
      price: 39.99,
      orig: 59.99,
      cur: "USD",
      code: "BGDEMO",
      wh: "EU",
      end: new Date(Date.now() + 36e5 * 24).toISOString(),
      updated: new Date().toISOString(),
      tags: ["gan", "charger", "blitzwolf"]
    }
  ];
}

export const handler: Handler = async (event) => {
  try {
    const qs = new URLSearchParams(event.queryStringParameters || {});
    const ifNoneMatch = event.headers["if-none-match"];
    const limit = Math.max(1, Math.min(200, parseInt(qs.get("limit") || "100", 10)));
    const cursor = qs.get("cursor");

    const all = await fetchDealsCanonical(qs);

    // egyszerű „score”: EU boost + közeli lejárat
    const scored = all.map(d => {
      let score = 0;
      if ((d.wh || "").toUpperCase() !== "CN") score += 10;
      if (d.end) {
        const days = Math.max(0, (new Date(d.end).getTime() - Date.now()) / 86400000);
        score += (10 - Math.min(10, days));
      }
      return { d, score };
    }).sort((a,b) => b.score - a.score).map(x => x.d);

    const start = cursor ? parseInt(cursor, 10) || 0 : 0;
    const page = scored.slice(start, start + limit);
    const next = start + limit < scored.length ? String(start + limit) : null;

    const payload = { count: scored.length, items: page, nextCursor: next };
    const json = JSON.stringify(payload);
    const etg = etagOf(json);

    if (ifNoneMatch && ifNoneMatch === etg) {
      return { statusCode: 304, headers: { ETag: etg, "Cache-Control": "public, max-age=600, stale-while-revalidate=60" }, body: "" };
    }

    LAST_JSON = json;
    LAST_ETAG = etg;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=600, stale-while-revalidate=60",
        "ETag": etg
      },
      body: json
    };
  } catch (e: any) {
    if (LAST_JSON) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60", "ETag": LAST_ETAG, "X-Fallback": "snapshot" },
        body: LAST_JSON
      };
    }
    return { statusCode: 500, body: JSON.stringify({ error: e?.message || "Server error" }) };
  }
};
