// Abre directamente la ficha de SwimCloud (nadador, universidad o competición).
// SwimCloud no tiene enlaces que se puedan adivinar, así que preguntamos al buscador
// DuckDuckGo por su primer resultado dentro de swimcloud.com y redirigimos allí.
// No se lee nada de SwimCloud: solo se reenvía al usuario a su página.
const KINDS = { swimmer: "swimcloud.com/swimmer", team: "swimcloud.com/team", meet: "swimcloud.com/results" };

export function pick(html) {
  const m = /uddg=([^&'"]+)/.exec(html || "");
  if (!m) return null;
  try {
    const u = new URL(decodeURIComponent(m[1]));
    return u.hostname.endsWith("swimcloud.com") ? u.href : null;
  } catch {
    return null;
  }
}

export default async (request) => {
  const p = new URL(request.url).searchParams;
  const kind = KINDS[p.get("k")] ? p.get("k") : "swimmer";
  const q = (p.get("q") || "").slice(0, 160).trim();
  const fallback = "https://www.swimcloud.com/search/?q=" + encodeURIComponent(q);
  if (!q) return Response.redirect("https://www.swimcloud.com/", 302);
  try {
    const r = await fetch("https://duckduckgo.com/?q=" + encodeURIComponent("\\" + q + " site:" + KINDS[kind]), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; results app)" },
      signal: AbortSignal.timeout(6000),
    });
    const url = pick(await r.text());
    return new Response(null, { status: 302, headers: { Location: url || fallback, "Cache-Control": url ? "public, max-age=604800" : "no-store" } });
  } catch {
    return Response.redirect(fallback, 302);
  }
};
