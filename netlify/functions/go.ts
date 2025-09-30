import type { Handler } from "@netlify/functions";

export const handler: Handler = async (event) => {
  const u = event.queryStringParameters?.u || "";
  if (!u) return { statusCode: 400, body: "Missing u" };

  // https + encode (biztonság kedvéért)
  const httpsUrl = u.replace(/^http:/, "https:");
  const safe = encodeURI(httpsUrl);

  // Visszaadunk egy apró HTML oldalt:
  // - Referrer-Policy: no-referrer (HTTP header)
  // - <meta name="referrer" content="no-referrer"> (fallback)
  // - <a rel="noreferrer"> és JS redirect
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=${safe}">
  <meta name="referrer" content="no-referrer">
  <title>Redirect…</title>
  <script>location.replace(${JSON.stringify(safe)});</script>
</head>
<body>
  <p>Redirecting… <a href="${safe}" rel="noreferrer" target="_top">Continue</a></p>
</body>
</html>`;

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
