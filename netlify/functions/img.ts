import type { Handler } from "@netlify/functions";
import axios from "axios";

// Cache beállítás: a böngésző 1 napig, a CDN 1 óráig tárolhatja a képet
const CACHE_CONTROL = "public, max-age=3600, s-maxage=86400";

export const handler: Handler = async (event) => {
  const u = event.queryStringParameters?.u;
  if (!u) {
    return { statusCode: 400, body: "Missing 'u' (URL) parameter" };
  }

  try {
    const response = await axios.get(u, {
      responseType: "arraybuffer", // Fontos, hogy bináris adatként kérjük le
      timeout: 8000,
      headers: {
        // Álcázzuk magunkat böngészőnek, hogy elkerüljük a 403-as hibákat
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Referer": "https://www.google.com/" // Gyakran segít a referer beállítása
      }
    });

    const contentType = response.headers["content-type"] || "image/jpeg";
    const body = Buffer.from(response.data, "binary").toString("base64");

    return {
      statusCode: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": CACHE_CONTROL,
      },
      body,
      isBase64Encoded: true, // jelezzük a Netlify-nak, hogy a body base64
    };
  } catch (error: any) {
    console.error("Image proxy error:", error.message);
    // Hiba esetén átirányítunk egy alapértelmezett képre
    return {
      statusCode: 302,
      headers: {
        "Location": "/icons/icon-512.png", // Módosítsd, ha más a placeholder elérési útja
        "Cache-Control": "no-cache",
      },
      body: "",
    };
  }
};
