import type { Handler } from "@netlify/functions";
import axios from "axios";

export const handler: Handler = async () => {
  try {
    const base = process.env.SELF_BASE_URL || "";
    if (!base) return { statusCode: 200, body: "Skip (no base)" };
    await axios.get(`${base}/.netlify/functions/coupons?limit=500`);
    return { statusCode: 200, body: "OK" };
  } catch (e: any) {
    return { statusCode: 500, body: e?.message || "ERR" };
  }
};
