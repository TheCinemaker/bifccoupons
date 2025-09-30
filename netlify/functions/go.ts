import type { Handler } from "@netlify/functions";

function appendUtm(u: string) {
  try {
    const url = new URL(u);
    const p = url.searchParams;
    if (!p.get("utm_source")) p.set("utm_source", "kinabolveddmeg");
    if (!p.get("utm_medium")) p.set("utm_medium", "pwa");
    if (!p.get("utm_campaign")) p.set("utm_campaign", "coupons");
    return url.toString();
  } catch {
    return u;
  }
}

export const handler: Handler = async (event) => {
  const u = event.queryStringParameters?.u || "";
  if (!u) return { statusCode: 400, body: "Missing u" };

  // https + encode + UTM
  const httpsUrl = u.replace(/^http:/, "https:");
  const withUtm = appendUtm(httpsUrl);
  const safe = encodeURI(withUtm);

  const html = `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=${safe}">
<meta name="referrer" content="no-referrer">
<title>Redirect…</title>
<script>location.replace(${JSON.stringify(safe)});</script>
</head>
<body>
Redirecting… <a href="${safe}" rel="noreferrer" target="_top">Continue</a>
</body></html>`;

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer"
    },
    body: html
  };
};
