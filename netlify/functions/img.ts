import type { Handler } from "@netlify/functions";
import axios from "axios";

export const handler: Handler = async (event) => {
  try {
    const u = event.queryStringParameters?.u;
    if (!u) return { statusCode: 400, body: "Missing u" };

    const url = u.replace(/^http:/, "https:");
    const resp = await axios.get(url, {
      responseType: "arraybuffer",
      // adunk “normális” fejléceket
      headers: {
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0",
        "Referer": "" // explicit no-referrer
      },
      timeout: 8000
    });

    const ct = resp.headers["content-type"] || "image/jpeg";
    return {
      statusCode: 200,
      headers: {
        "Content-Type": ct,
        "Cache-Control": "public, max-age=86400"
      },
      body: resp.data.toString("base64"),
      isBase64Encoded: true
    };
  } catch (e: any) {
    return { statusCode: 502, body: e?.message || "Image fetch error" };
  }
};
