// Proxy de solo lectura para las fuentes públicas que usa la app.
// El navegador no puede leer estas webs directamente (CORS), así que la app
// las pide aquí. Solo se permiten estos dominios y solo peticiones GET.
const ALLOWED = [
  "swimmeetresults.tech",
  "site.api.espn.com",
  "en.wikipedia.org",
];
const LONG_CACHE = ["site.api.espn.com", "en.wikipedia.org"];

export function allowed(target) {
  try {
    const u = new URL(target);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return ALLOWED.some((h) => u.hostname === h || u.hostname.endsWith("." + h));
  } catch {
    return false;
  }
}

export default async (request) => {
  const target = new URL(request.url).searchParams.get("url");
  if (!target || !allowed(target)) {
    return new Response("Fuente no permitida", { status: 400 });
  }
  const upstream = await fetch(target, {
    headers: { "User-Agent": "natacion-usa/0.3 (app personal de resultados)" },
    redirect: "follow",
  });
  if (upstream.url && !allowed(upstream.url)) {
    return new Response("Fuente no permitida", { status: 400 });
  }
  const host = new URL(target).hostname;
  const maxAge = LONG_CACHE.includes(host) ? 86400 : 60;
  const buf = await upstream.arrayBuffer();
  // HY-TEK publica en Windows-1252.
  const type = upstream.headers.get("content-type") || "";
  const charset = /charset=([^;]+)/i.exec(type)?.[1]?.toLowerCase();
  const text = new TextDecoder(charset && charset !== "iso-8859-1" ? charset : host.includes("swimmeetresults") ? "windows-1252" : "utf-8").decode(buf);
  return new Response(text, {
    status: upstream.status,
    headers: {
      "Content-Type": type.includes("json") ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAge}`,
      "Netlify-CDN-Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=30`,
    },
  });
};
