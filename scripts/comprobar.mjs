// Comprueba la app publicada: campeonatos, pruebas y enlaces de las fichas.
import { parseCatalog, parseIndex, parseEvent, parseFeed, uniqueEvents, normalizeMeetUrl } from "../web/parser.js";
import { readFile } from "node:fs/promises";
const BASE = process.env.BASE || "https://usaresultssss.netlify.app/";
const t0 = Date.now();
async function get(url) {
  const s = Date.now();
  try {
    const r = await fetch(BASE + "api/fuente?url=" + encodeURIComponent(url), { signal: AbortSignal.timeout(30000) });
    return { ok: r.ok, status: r.status, text: await r.text(), ms: Date.now() - s };
  } catch (e) {
    return { ok: false, status: e.name, text: "", ms: Date.now() - s };
  }
}
async function pool(items, n, fn) {
  let i = 0;
  const out = [];
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}
const fails = [];
const cat = await get("https://swimmeetresults.tech/");
const meets = parseCatalog(cat.text, "https://swimmeetresults.tech/");
console.log("catálogo", cat.status, cat.ms + "ms", meets.length, "campeonatos");
const feeds = [];
for (const f of ["https://swimswam.com/feed/", "https://swimswam.com/feed/?paged=2", "https://swimswam.com/feed/?paged=3"]) {
  const r = await get(f);
  console.log("feed", f, r.status, r.ms + "ms");
  feeds.push(...parseFeed(r.text));
}
const all = [...meets.map((m) => ({ name: m.name, url: normalizeMeetUrl(m.url), year: m.year })), ...feeds.map((f) => ({ name: f.name, url: f.url, year: "ss" }))];
let evOk = 0, evBad = 0, slow = 0;
await pool(all, 4, async (m) => {
  const r = await get(m.url);
  if (!r.ok) {
    if (!/2027/.test(m.url)) fails.push(`ÍNDICE ${r.status} ${m.name} ${m.url}`);
    return;
  }
  const meet = parseIndex(r.text, m.url);
  const evs = uniqueEvents(meet);
  if (!evs.length) fails.push(`SIN PRUEBAS ${m.name} ${m.url} :: ${r.text.slice(0, 160).replace(/\s+/g, " ")}`);
  const sample = m.year === "ss" ? evs : [evs[0], evs[Math.floor(evs.length / 2)], evs[evs.length - 1]].filter(Boolean);
  for (const e of sample) {
    const er = await get(e.url);
    if (er.ms > 8000) slow++;
    const ev = er.ok ? parseEvent(er.text, e.url) : null;
    if (ev && ev.results.length) evOk++;
    else {
      evBad++;
      if (er.ok && !/not available|no results/i.test(er.text)) fails.push(`PRUEBA SIN FILAS ${m.name} #${e.number} ${e.url} :: ${er.text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 200)}`);
      else if (!er.ok) fails.push(`PRUEBA ${er.status} ${m.name} #${e.number} ${e.url}`);
    }
  }
});
console.log("pruebas con filas:", evOk, "sin filas:", evBad, "lentas:", slow);
// Enlaces de las fichas
const { unis } = JSON.parse(await readFile("web/data/unis.json", "utf8"));
const links = unis.filter((u) => u.web).map((u) => [u.n, u.web.startsWith("http") ? u.web : "https://" + u.web]);
let linkBad = 0;
await pool(links, 10, async ([n, url]) => {
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000) });
    if (r.status >= 400 && r.status !== 403) { linkBad++; fails.push(`WEB ${r.status} ${n} ${url}`); }
  } catch (e) { linkBad++; fails.push(`WEB ${e.name} ${n} ${url}`); }
});
console.log("webs revisadas:", links.length, "rotas:", linkBad);
console.log("FALLOS:\n" + fails.join("\n"));
console.log("tiempo", Math.round((Date.now() - t0) / 1000) + "s");
