import type { Handler } from "@netlify/functions";

const { BANGGOOD_AFFILIATE_PARAM } = process.env;

function withUtm(u: string, src?: string) {
  try {
    const url = new URL(u);
    if (!url.searchParams.has("utm_source")) {
      url.searchParams.set("utm_source", "kinabolveddmeg");
      url.searchParams.set("utm_medium", "pwa");
      if (src) url.searchParams.set("utm_campaign", src);
    }
    // Banggood affiliate ?p=
    if (/banggood\.com/i.test(url.hostname) && BANGGOOD_AFFILIATE_PARAM && !url.searchParams.has("p")) {
      url.searchParams.set("p", BANGGOOD_AFFILIATE_PARAM);
    }
    return url.toString();
  } catch {
    return u;
  }
}

export const handler: Handler = async (event) => {
  const qs = new URLSearchParams(event.queryStringParameters || {});
  const u = qs.get("u");
  const src = qs.get("src") || undefined;
  if (!u) return { statusCode: 400, body: "Missing u" };
  const dest = withUtm(u, src || undefined);
  return {
    statusCode: 302,
    headers: { Location: dest, "Cache-Control": "no-store" },
    body: "",
  };
};
