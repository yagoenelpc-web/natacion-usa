// Proxy de solo lectura para las fuentes públicas que usa la app.
// El navegador no puede leer estas webs directamente (CORS), así que la app
// las pide aquí. Solo se permiten estas fuentes y solo peticiones GET.
const HOSTS = ["swimmeetresults.tech", "site.api.espn.com", "en.wikipedia.org"];
const LONG_CACHE = ["site.api.espn.com", "en.wikipedia.org"];
// Páginas de resultados HY-TEK de cualquier web (universidades, sidearmstats…).
const HYTEK_PATH = /(\/evtindex\.htm|\/index\.htm|lastevt\.htm|\/\d{6}[A-Z]\d{3}\.htm)$/i;

export function allowed(target) {
  try {
    const u = new URL(target);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (u.username || u.password || (u.port && u.port !== "80" && u.port !== "443")) return false;
    if (HOSTS.some((h) => u.hostname === h || u.hostname.endsWith("." + h))) return true;
    // Solo el canal RSS de SwimSwam (titulares y enlaces), no sus artículos.
    if (u.hostname === "swimswam.com") return /^\/(feed|tag\/live-results\/feed)\/?$/.test(u.pathname);
    if (/^(localhost|[\d.]+|\[.*\])$/.test(u.hostname) || !u.hostname.includes(".")) return false;
    return HYTEK_PATH.test(u.pathname);
  } catch {
    return false;
  }
}

export default async (request) => {
  const target = new URL(request.url).searchParams.get("url");
  if (!target || !allowed(target)) {
    return new Response("Fuente no permitida", { status: 400 });
  }
  let upstream;
  try {
    upstream = await fetch(target, {
      headers: { "User-Agent": "natacion-usa/0.4 (app personal de resultados)" },
      redirect: "follow",
      signal: AbortSignal.timeout(9000),
    });
  } catch {
    return new Response("No responde", { status: 504 });
  }
  if (upstream.url && !allowed(upstream.url)) {
    return new Response("Fuente no permitida", { status: 400 });
  }
  const host = new URL(target).hostname;
  const maxAge = LONG_CACHE.includes(host) ? 86400 : host === "swimswam.com" ? 600 : 60;
  const buf = await upstream.arrayBuffer();
  const type = upstream.headers.get("content-type") || "";
  if (!/json|xml|html|text|rss/i.test(type) && type) {
    return new Response("Tipo no permitido", { status: 415 });
  }
  // HY-TEK publica en Windows-1252.
  const charset = /charset=([^;]+)/i.exec(type)?.[1]?.toLowerCase().trim();
  let text;
  try {
    text = new TextDecoder(charset && charset !== "iso-8859-1" ? charset : /json|xml|rss/i.test(type) ? "utf-8" : "windows-1252").decode(buf);
  } catch {
    text = new TextDecoder("windows-1252").decode(buf);
  }
  return new Response(text, {
    status: upstream.status,
    headers: {
      "Content-Type": type.includes("json") ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAge}`,
      "Netlify-CDN-Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=30`,
    },
  });
};
