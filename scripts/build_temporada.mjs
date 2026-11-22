// Datos que se actualizan solos cada día (GitHub Actions):
// - web/data/archivo.json: competiciones encontradas (SwimSwam y webs HY-TEK de las universidades), se van acumulando.
// - web/data/ncaa.json: puesto de cada universidad en los últimos campeonatos NCAA (chicos y chicas).
// - web/data/nadadores.json: nadadores vistos en los resultados públicos de la temporada, con sus mejores marcas.
import { readFile, writeFile } from "node:fs/promises";
import { parseCatalog, parseIndex, uniqueEvents, parseEvent, parseFeed, normalizeMeetUrl, organization } from "../web/parser.js";

const UA = { "User-Agent": "Mozilla/5.0 (compatible; natacion-usa/0.6; app personal)" };
const SOURCE = "https://swimmeetresults.tech/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJSON = async (f, d) => { try { return JSON.parse(await readFile(f, "utf8")); } catch { return d; } };
async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) });
      if (r.ok) {
        const buf = new Uint8Array(await r.arrayBuffer());
        return new TextDecoder(/utf-8/i.test(r.headers.get("content-type") || "") ? "utf-8" : "windows-1252").decode(buf);
      }
      if (r.status === 404) return null;
    } catch {}
    await sleep(1500 * (i + 1));
  }
  return null;
}
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      try { out[k] = await fn(items[k], k); } catch { out[k] = null; }
    }
  }));
  return out;
}
const isoDay = (d) => new Date(d).toISOString().slice(0, 10);
const toISO = (s) => { const t = Date.parse(s || ""); return isNaN(t) ? "" : isoDay(t); };
const now = Date.now();
// Temporada: desde el 1 de agosto.
const y = new Date().getUTCFullYear();
const seasonStart = Date.UTC(new Date().getUTCMonth() >= 7 ? y : y - 1, 7, 1);

// 1) Archivo de competiciones.
const unis = (await readJSON("web/data/unis.json", { unis: [] })).unis;
const archivo = await readJSON("web/data/archivo.json", { meets: [] });
const byUrl = new Map(archivo.meets.map((m) => [m.url, m]));
const feeds = ["https://swimswam.com/feed/", "https://swimswam.com/feed/?paged=2", "https://swimswam.com/feed/?paged=3", "https://swimswam.com/feed/?paged=4", "https://swimswam.com/feed/?paged=5", "https://swimswam.com/feed/?paged=6", "https://swimswam.com/feed/?paged=7", "https://swimswam.com/feed/?paged=8", "https://swimswam.com/tag/live-results/feed/?paged=2", "https://swimswam.com/tag/live-results/feed/?paged=3", "https://swimswam.com/tag/live-results/feed/", "https://swimswam.com/category/college/feed/", "https://swimswam.com/category/college/feed/?paged=2"];
const found = [];
for (const f of feeds) {
  const x = await get(f);
  if (x) for (const m of parseFeed(x)) found.push({ url: m.url, name: m.name, article: m.article, src: "swimswam" });
}
// Swimming World: igual que SwimSwam, solo titulares y los enlaces a resultados HY-TEK de sus noticias.
for (const f of ["https://www.swimmingworldmagazine.com/news/feed/", "https://www.swimmingworldmagazine.com/news/feed/?paged=2"]) {
  const x = await get(f, 1);
  const n0 = found.length;
  if (x) for (const m of parseFeed(x)) found.push({ url: m.url, name: m.name, article: m.article, src: "swimmingworld" });
  console.log("Swimming World:", f, x ? found.length - n0 : "no carga");
}
const calJ = await readJSON("web/data/calendario.json", { live: [], cal: {} });
for (const l of calJ.live || []) found.push({ url: normalizeMeetUrl(l), src: "web" });
// Resultados HY-TEK enlazados desde el calendario de cada universidad (más nadadores con sus marcas).
const seenRes = new Set(found.map((f) => f.url));
for (const g of Object.values(calJ.cal || {}).flat()) for (const l of [g.res, g.live]) {
  if (!l || !/\.htm$/i.test(l) || !/sidearmstats|evtindex|\/index\.htm$/i.test(l)) continue;
  const url = normalizeMeetUrl(l);
  if (!seenRes.has(url)) { seenRes.add(url); found.push({ url, src: "web" }); }
}
// Catálogo de swimmeetresults.tech: competiciones universitarias de esta temporada (invitationals de los grandes equipos).
{
  const cat0 = await get(SOURCE);
  const items = cat0 ? parseCatalog(cat0, SOURCE) : [];
  let n = 0;
  for (const m of items) {
    const nm = m.name || "";
    if (/usa swimming|sectional|junior|futures|pro swim|speedo|tyr pro|masters|usms|age group|\bLSC\b|zone|ymca|high school|\bHS\b/i.test(nm)) continue;
    if (!/univ|college|invit|invite|ncaa|naia|conference|classic|dual|\bvs\b|\bcup\b|championship|athletic/i.test(nm)) continue;
    const url = normalizeMeetUrl(m.url);
    if (!seenRes.has(url)) { seenRes.add(url); found.push({ url, src: "catalogo" }); n++; }
  }
  console.log("catálogo universitario:", n, "de", items.length);
}
for (const u of unis.filter((u) => u.hytek)) found.push({ url: `https://www.sidearmstats.com/${u.hytek}/swim/evtindex.htm`, host: u.n, src: "hytek" });
console.log("candidatas:", found.length);
let added = 0, updated = 0;
await pool(found, 6, async (c) => {
  const html = await get(c.url);
  if (!html) return;
  const meet = parseIndex(html, c.url);
  const evs = uniqueEvents(meet);
  if (!evs.length || !meet.name) return;
  const start = toISO(meet.start), end = toISO(meet.end) || start;
  if (start && Date.parse(end) < seasonStart) return;
  // Las webs HY-TEK de cada universidad se reutilizan: se guarda con su fecha para no pisar la anterior.
  const key = c.src === "hytek" ? `${normalizeMeetUrl(c.url)}#${start}` : normalizeMeetUrl(c.url);
  const prev = byUrl.get(key);
  const m = { url: key, name: meet.name.trim(), start, end, events: evs.length, org: organization(meet.name), ...(c.article ? { article: c.article } : prev?.article ? { article: prev.article } : {}), ...(c.host ? { host: c.host } : {}), src: c.src, seen: isoDay(now) };
  if (!prev) added++;
  else updated++;
  byUrl.set(key, { ...prev, ...m });
});
const meets = [...byUrl.values()].filter((m) => !m.end || Date.parse(m.end) >= seasonStart - 400 * 864e5).sort((a, b) => (b.start || "").localeCompare(a.start || ""));
await writeFile("web/data/archivo.json", JSON.stringify({ updated: isoDay(now), meets }));
console.log("archivo:", meets.length, "nuevas:", added, "actualizadas:", updated);
console.log(meets.slice(0, 25).map((m) => `${m.start} ${m.name} (${m.src})`).join("\n"));

// 2) NCAA: últimos campeonatos de cada división.
const catHtml = await get(SOURCE);
const catalog = catHtml ? parseCatalog(catHtml, SOURCE) : [];
console.log("catálogo:", catalog.length, catalog.filter((m) => /ncaa|naia/i.test(m.name)).slice(0, 30).map((m) => m.name).join(" | "));
const DIVS = [["D1", /division i\b(?!i)|div(ision)?\.?\s*1\b|\bd-?1\b/i], ["D2", /division ii\b(?!i)|\bd-?2\b/i], ["D3", /division iii\b|\bd-?3\b/i], ["NAIA", /naia/i]];
function divOf(name) {
  for (const [d, re] of DIVS.slice().reverse()) if (re.test(name)) return d;
  return /ncaa/i.test(name) ? "D1" : "";
}
const sexOf = (name) => (/women|girls/i.test(name) ? "W" : /\bmen\b|boys/i.test(name) ? "M" : "");
const ncaa = { updated: isoDay(now), divisions: {} };
async function finalScores(meetUrl) {
  const html = await get(normalizeMeetUrl(meetUrl));
  if (!html) return null;
  const meet = parseIndex(html, normalizeMeetUrl(meetUrl));
  const evs = uniqueEvents(meet).sort((a, b) => b.number - a.number).slice(0, 30);
  const best = {};
  for (let i = 0; i < evs.length; i += 6) {
    const got = await pool(evs.slice(i, i + 6), 6, async (e) => { const h = await get(e.url); return h ? parseEvent(h, e.url) : null; });
    for (const ev of got.filter(Boolean)) {
      if (!ev.scores.length) continue;
      const g0 = sexOf(ev.title);
      for (const g of ["M", "W", ""]) {
        const list = ev.scores.filter((s) => (s.g || g0 || "") === g);
        if (list.length && (!best[g] || ev.number > best[g].n)) best[g] = { n: ev.number, list };
      }
    }
    if (Object.keys(best).length) break;
  }
  return { name: meet.name, best };
}
const ncaaMeets = catalog.filter((m) => /ncaa|naia/i.test(m.name) && !/2027/.test(m.year)).sort((a, b) => b.year - a.year);
const done = new Set();
for (const m of ncaaMeets) {
  const d = divOf(m.name);
  const sx = sexOf(m.name);
  if (!d) continue;
  const need = sx ? [sx] : ["M", "W"];
  if (need.every((g) => done.has(d + g))) continue;
  const r = await finalScores(m.url);
  if (!r) continue;
  for (const g of need) {
    if (done.has(d + g)) continue;
    const list = r.best[g]?.list || (sx === g ? r.best[""]?.list : null);
    if (!list?.length) continue;
    ncaa.divisions[d] ||= {};
    ncaa.divisions[d][g] = { year: m.year, meet: m.name, teams: list.map((s) => ({ p: s.p, t: s.t, pts: s.pts })) };
    done.add(d + g);
  }
}
// D-III y NAIA no publican la clasificación completa en HY-TEK: campeón y subcampeón desde Wikipedia (CC BY-SA).
const WIKI = { D3: { M: "NCAA Division III men's swimming and diving championships", W: "NCAA Division III women's swimming and diving championships" }, NAIA: { M: "NAIA men's swimming and diving championships", W: "NAIA women's swimming and diving championships" } };
const strip = (c) => c.replace(/<[^>]+>/g, " ").replace(/\{\{\s*sort\s*\|[^|}]*\|([^}]*)\}\}/gi, "$1").replace(/\{\{[^{}]*\}\}/g, "").replace(/<ref[\s\S]*?(<\/ref>|\/>)/gi, "").replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").replace(/'{2,}/g, "").replace(/\(\d+\)/g, "").replace(/½/g, ".5").trim();
for (const [d, bySex] of Object.entries(WIKI)) {
  for (const [g, title] of Object.entries(bySex)) {
    if (ncaa.divisions[d]?.[g]) continue;
    try {
      const j = await (await fetch("https://en.wikipedia.org/w/api.php?" + new URLSearchParams({ action: "parse", page: title, prop: "wikitext", redirects: "1", format: "json", formatversion: "2" }), { headers: UA })).json();
      const wt = j.parse?.wikitext || "";
      const rows = wt.split(/\n\|-/).filter((r) => /\b20\d{2}\b/.test(r));
      const num = (c) => /^\d+(\.\d+)?$/.test(c);
      const cand = rows
        .map((r) => ({ yr: +(/\b(20\d{2})\b/.exec(r)?.[1] || 0), r }))
        .filter((x) => x.yr && x.yr <= new Date().getUTCFullYear())
        .sort((a, b) => b.yr - a.yr)
        .map((x) => {
          const cells = x.r.split(/\n==|\n\{\{/)[0].split(/\n[|!]|\|\||!!/).map((c) => strip(c.replace(/^[^|\n[]*?(style|align|rowspan|colspan|bgcolor|scope)=[^|]*\|/i, ""))).filter(Boolean);
          const pts = cells.map((c, i) => (num(c) && i > 0 && !num(cells[i - 1]) && !/^(19|20)\d{2}$/.test(c) ? i : -1)).filter((i) => i > 0);
          return { ...x, cells, pts };
        })
        .filter((x) => x.pts.length >= 2);
      const best = cand[0];
      if (!best) continue;
      const { cells, pts } = best;
      console.log("wiki", d, g, best.yr, JSON.stringify(cells).slice(0, 300));
      const teams = pts.slice(0, 2).map((i, k) => ({ p: k + 1, t: cells[i - 1].replace(/\s*\(.*$/, ""), pts: cells[i] }));
      ncaa.divisions[d] ||= {};
      ncaa.divisions[d][g] = { year: String(best.yr), meet: title, teams, partial: true };
    } catch (e) {
      console.log("wiki", d, g, e.message);
    }
  }
}
await writeFile("web/data/ncaa.json", JSON.stringify(ncaa));
for (const [d, v] of Object.entries(ncaa.divisions)) for (const [g, x] of Object.entries(v)) console.log("NCAA", d, g, x.year, x.teams.length, x.teams.slice(0, 5).map((t) => t.p + "." + t.t).join(" "));

// 3) Nadadores: resultados de la temporada (archivo) y de los últimos campeonatos NCAA.
const sources = [
  ...meets.filter((m) => !m.start || Date.parse(m.start) >= seasonStart).map((m) => ({ key: m.url, url: m.url.split("#")[0], name: m.name, start: m.start, end: m.end })),
  ...ncaaMeets.filter((m) => +m.year >= new Date(seasonStart).getUTCFullYear()).map((m) => ({ key: normalizeMeetUrl(m.url), url: normalizeMeetUrl(m.url), name: m.name, start: m.year + "-03-01" })),
];
const swimmers = new Map();
const keyOf = (n, t) => (n + "|" + t).toLowerCase().replace(/\s+/g, " ");
// Incremental: las competiciones ya terminadas y leídas no se vuelven a descargar.
let prevSw = await readJSON("web/data/nadadores.json", { swimmers: [], done: [] });
if (prevSw.v !== 2) prevSw = { swimmers: [], done: [] };
const doneMeets = new Set(prevSw.done || []);
if (doneMeets.size) for (const s of prevSw.swimmers) swimmers.set(keyOf(s.n, s.t), { ...s, b: { ...s.b }, m: [...s.m] });
const finished = (s) => s.start && Date.parse(s.end || s.start) < now - 2 * 864e5;
const secs = (t) => { const m = /^(?:(\d+):)?(\d+\.\d+)/.exec(t.replace(/^[xX*]/, "")); return m ? (+m[1] || 0) * 60 + +m[2] : Infinity; };
const short = (title) => title.replace(/^(Women|Men|Girls|Boys|Mixed)\s+/i, "").replace(/\s+Yard\s+/i, " Y ").replace(/\s+LC\s+Meter\s+|\s+SC\s+Meter\s+|\s+Meter\s+/i, " M ").replace(/Freestyle/i, "Free").replace(/Backstroke/i, "Back").replace(/Breaststroke/i, "Breast").replace(/Butterfly/i, "Fly").replace(/Individual Medley/i, "IM").trim();
let evCount = 0;
const todo = sources.filter((s) => !doneMeets.has(s.key));
console.log("competiciones por leer:", todo.length, "ya leídas:", sources.length - todo.length);
await pool(todo, 3, async (s) => {
  const html = await get(s.url);
  if (!html) return;
  if (finished(s)) doneMeets.add(s.key);
  const meet = parseIndex(html, s.url);
  const evs = uniqueEvents(meet);
  for (const e of evs) {
    const h = await get(e.url, 2);
    if (!h) continue;
    const ev = parseEvent(h, e.url);
    if (ev.relay || !ev.results.length || /diving|div(e|ing)/i.test(ev.title)) continue;
    evCount++;
    const g = sexOf(ev.title);
    for (const r of ev.results) {
      if (!r.n || !r.t || !r.m || /^(DQ|NS|SCR|DFS|NT)$/i.test(r.m) || !/[a-z]/i.test(r.n)) continue;
      const name = (r.n.includes(",") ? r.n.split(",").map((x) => x.trim()).filter(Boolean).reverse().join(" ") : r.n).replace(/\s+/g, " ").trim();
      if (name.split(" ").length < 2) continue;
      const k = keyOf(name, r.t);
      const sw = swimmers.get(k) || { n: name, t: r.t, g, y: "", b: {}, m: [] };
      if (r.n.includes(",") && !sw.l) sw.l = r.n.split(",")[0].trim();
      if (r.y && /^(FR|SO|JR|SR|5Y|GR)$/i.test(r.y)) sw.y = r.y.toUpperCase();
      const evn = short(ev.title);
      if (!sw.b[evn] || secs(r.m) < secs(sw.b[evn][0])) sw.b[evn] = [r.m.replace(/[A-Za-z!#$&*@^]+$/, ""), s.name, s.url];
      if (!sw.m.includes(s.name)) sw.m.push(s.name);
      swimmers.set(k, sw);
    }
  }
});
const list = [...swimmers.values()].map((s) => ({ n: s.n, t: s.t, ...(s.l ? { l: s.l } : {}), ...(s.g ? { g: s.g } : {}), ...(s.y ? { y: s.y } : {}), b: Object.fromEntries(Object.entries(s.b).sort((a, b) => a[0].localeCompare(b[0]))), m: s.m.slice(-12) }));
list.sort((a, b) => a.n.localeCompare(b.n));
await writeFile("web/data/nadadores.json", JSON.stringify({ v: 2, updated: isoDay(now), meets: sources.length, done: [...doneMeets], swimmers: list, mi: prevSw.mi || {} }));
console.log("nadadores:", list.length, "pruebas leídas:", evCount, "competiciones:", sources.length, "tamaño:", JSON.stringify(list).length);
