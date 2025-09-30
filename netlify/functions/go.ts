import type { Handler } from "@netlify/functions";

export const handler: Handler = async (event) => {
  const u = event.queryStringParameters?.u || "";
  if (!u) return { statusCode: 400, body: "Missing u" };

  const httpsUrl = u.replace(/^http:/, "https:");
  const safe = encodeURI(httpsUrl);

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
