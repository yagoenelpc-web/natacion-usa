// Revisa los enlaces que enseña la app (web de deportes y de la universidad, Wikipedia, plantillas y entrenadores,
// fuentes de récords y PDF de resultados de las últimas semanas).
// -> web/data/enlaces.json { fix: { url: urlNueva }, bad: { url: 1 }, n: { url: fallosSeguidos } }
// La app cambia los enlaces movidos por su dirección nueva y quita los rotos (2 fallos seguidos en días distintos).
import { readFile, writeFile } from "node:fs/promises";

const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", Accept: "text/html,application/xhtml+xml,application/pdf,*/*" };
const J = async (f, d) => { try { return JSON.parse(await readFile("web/data/" + f, "utf8")); } catch { return d; } };
const urls = new Set();
for (const u of (await J("unis.json", { unis: [] })).unis) for (const k of ["web", "uweb", "wiki", "rosterUrl", "rosterMUrl", "rosterWUrl", "staffUrl", "staffMUrl", "staffWUrl"]) if (/^https?:/.test(u[k] || "")) urls.add(u[k]);
for (const r of Object.values((await J("records.json", { u: {} })).u || {})) if (r.src) urls.add(r.src);
const lim = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
for (const m of (await J("encuentros.json", { meets: [] })).meets || []) if ((m.d || "") >= lim && /^https?:/.test(m.src || "")) urls.add(m.src);
const old = await J("enlaces.json", { fix: {}, bad: {}, n: {} });
const out = { fix: {}, bad: {}, n: {} };
const list = [...urls];
console.log("enlaces:", list.length);
// Mismo sitio, solo cambia http/https, www o la barra final: no hace falta guardarlo.
const same = (a, b) => a.replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "").toLowerCase() === b.replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "").toLowerCase();
async function check(u) {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(u, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) });
      r.body?.cancel().catch(() => {});
      if (r.status === 404 || r.status === 410) return { dead: true };
      if (r.ok) return { final: r.url };
      if (r.status === 403 || r.status === 429 || r.status >= 500) return {}; // protegido o caído un rato: no se toca
    } catch (e) {
      if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(String(e?.cause?.code || e?.cause || e))) return { dead: true };
    }
  }
  return {};
}
let i = 0, nFix = 0, nBad = 0;
await Promise.all(Array.from({ length: 16 }, async () => {
  while (i < list.length) {
    const u = list[i++];
    const r = await check(u);
    if (r.dead) {
      out.n[u] = (old.n[u] || 0) + 1;
      if (out.n[u] >= 2) { out.bad[u] = 1; nBad++; }
    } else if (r.final && !same(r.final, u) && !/login|signin|404|not-?found|error/i.test(r.final)) { out.fix[u] = r.final; nFix++; }
  }
}));
console.log("movidos:", nFix, "· rotos:", nBad, "· fallaron hoy (se miran otro día):", Object.keys(out.n).length - nBad);
for (const [u, v] of Object.entries(out.fix).slice(0, 15)) console.log("  movido", u, "→", v);
for (const u of Object.keys(out.bad).slice(0, 15)) console.log("  roto", u);
await writeFile("web/data/enlaces.json", JSON.stringify({ updated: new Date().toISOString().slice(0, 10), ...out }));
