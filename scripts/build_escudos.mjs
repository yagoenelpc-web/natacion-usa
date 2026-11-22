// Escudos de universidades que salen en los resultados pero no están en unis.json (NAIA, institutos, Canadá...),
// como Ave Maria University. Busca en Wikipedia el artículo de deportes de esa universidad y usa su logo.
// -> web/data/escudos.json { e: { claveEquipo: urlLogo } }   SOLO="Ave Maria University-FL" prueba sin guardar.
import { readFile, writeFile } from "node:fs/promises";

const UA = { "User-Agent": "USAResultsApp/1.0 (swimming results app)" };
const SOLO = (process.env.SOLO || "").split(",").map((s) => s.trim()).filter(Boolean);
const J = async (f, d) => { try { return JSON.parse(await readFile("web/data/" + f, "utf8")); } catch { return d; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wp(params) {
  const u = "https://en.wikipedia.org/w/api.php?" + new URLSearchParams({ format: "json", formatversion: "2", ...params });
  await sleep(200);
  for (let i = 0; i < 5; i++) {
    try { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(30000) }); if (r.ok) return await r.json(); if (r.status !== 429 && r.status < 500) return null; } catch {}
    await sleep(2000 * 2 ** i);
  }
  return null;
}
// La misma clave que usa la app (web/app.js, escudoKey).
export const escudoKey = (t) => String(t || "").replace(/-[A-Z]{2}$/, "").replace(/\((m|w|men|women)\)/gi, "").replace(/^FY\s+/, "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(swim(ming)?|team|club|men s|women s|diving|aquatics|varsity)\b/g, " ").replace(/\bsaint\b/g, "st").replace(/\b(the|university|univ|uni|universit|college|of|at|u)\b/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const unis = (await J("unis.json", { unis: [] })).unis;
const names = unis.flatMap((x) => [x.n, x.full, x.short].filter(Boolean).map(escudoKey));
const known = new Set(names);
const matched = (k) => known.has(k) || names.some((n) => n.length >= 4 && k.length >= 6 && (n.startsWith(k) || k.startsWith(n + " ")));
const count = new Map();
for (const x of (await J("nad-indice.json", { s: [] })).s) if (x[1]) count.set(x[1], (count.get(x[1]) || 0) + 1);
const groups = new Map();
for (const [t, n] of count) {
  if (SOLO.length ? !SOLO.includes(t) : !/universit|college|institute|academy|\bstate\b|tech\b|\bU\b/i.test(t)) continue;
  const k = escudoKey(t);
  if (!k || (!SOLO.length && matched(k))) continue;
  const g = groups.get(k) || { n: 0, names: [] };
  g.n += n; g.names.push(t); groups.set(k, g);
}
const todo = [...groups].filter(([, g]) => g.n >= 3 || SOLO.length);
console.log("equipos sin escudo:", todo.length);
const old = (await J("escudos.json", { e: {} })).e || {};
const out = {};
const LOGO = /\.(svg|png|gif)$|logo|wordmark|athletic|emblem|crest|shield|seal|mark/i;
for (const [k, g] of todo) {
  // Nombre limpio para buscar: sin código de zona ni "Swim Team"; los cortados a 30 letras los arregla el buscador.
  const name = g.names.sort((a, b) => b.length - a.length)[0].replace(/-[A-Z]{2}$/, "").replace(/^FY\s+/, "").replace(/\b(Swim(ming)?( Team)?|Varsity|Men'?s Swim)\b.*$/i, "").replace(/^U\.?S\.? /, "United States ").replace(/^U of /, "University of ").trim();
  const sig = k.split(" ").filter((w) => w.length >= 4);
  let logo = "";
  for (const q of [`${name} athletics`, `${name} sports teams`, name]) {
    const r = await wp({ action: "query", generator: "search", gsrsearch: q, gsrlimit: "3", prop: "pageimages", piprop: "thumbnail|name", pithumbsize: "160", pilicense: "any" });
    const pages = (r?.query?.pages || []).sort((a, b) => (a.index || 0) - (b.index || 0));
    for (const p of pages) {
      const title = escudoKey(p.title);
      // El artículo tiene que ser de esa universidad: todas sus palabras importantes (o la primera, si está cortada) en el título.
      const tw = title.split(" ");
      const has = (w) => tw.some((x) => x.startsWith(w.slice(0, 5)));
      const okTitle = sig.length > 0 && has(sig[0]) && sig.filter(has).length >= Math.ceil(sig.length / 2);
      if (!okTitle || !p.thumbnail?.source || !LOGO.test(p.pageimage || "")) continue;
      if (/campus|building|hall|aerial|view|entrance|panorama/i.test(p.pageimage || "")) continue;
      logo = p.thumbnail.source; break;
    }
    if (logo) break;
  }
  if (!logo && old[k]) logo = old[k];
  if (logo) out[k] = logo;
  console.log(logo ? "✓" : "·", g.names[0], "→", name, logo ? decodeURIComponent(logo.split("/").pop()) : "");
}
console.log("escudos encontrados:", Object.keys(out).length, "de", todo.length);
if (SOLO.length) process.exit(0);
await writeFile("web/data/escudos.json", JSON.stringify({ updated: new Date().toISOString().slice(0, 10), e: out }));
