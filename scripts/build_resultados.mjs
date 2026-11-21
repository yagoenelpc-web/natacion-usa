// Resultados completos de los encuentros (duales, invitationals, campeonatos) que cada universidad
// enlaza en su calendario oficial: PDF de HY-TEK (con pdftotext) y páginas HY-TEK en HTML.
// - web/data/m/<id>.json: cada encuentro con todas sus pruebas, tiempos y puestos (la app lo abre dentro).
// - web/data/encuentros.json: índice (nombre, fecha, universidades) y lista de enlaces ya leídos.
// - web/data/nadadores.json: añade las marcas de estos encuentros a las mejores marcas de cada nadador.
// Temporada actual (enlaces de calendario.json) y temporadas anteriores (calendario de cada año en su web).
// Va por partes: se para a los MAX_MIN minutos y sigue en la siguiente ejecución.
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseIndex, uniqueEvents, parseEvent, normalizeMeetUrl } from "../web/parser.js";

const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" };
const T0 = Date.now();
const MAX_MIN = +(process.env.MAX_MIN || 40);
const SEASONS_BACK = +(process.env.SEASONS_BACK || 2);
const DEBUG = +(process.env.DEBUG || 0);
const timeUp = () => Date.now() - T0 > MAX_MIN * 60e3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJSON = async (f, d) => { try { return JSON.parse(await readFile(f, "utf8")); } catch { return d; } };
async function get(url, bin = false) {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(30000) });
      if (r.ok) return { url: r.url, type: r.headers.get("content-type") || "", body: bin ? Buffer.from(await r.arrayBuffer()) : await r.text() };
      if (r.status === 404 || r.status === 403 || r.status === 405) return null;
    } catch {}
    await sleep(1500);
  }
  return null;
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length && !timeUp()) {
      const k = i++;
      try { await fn(items[k], k); } catch (e) { if (DEBUG) console.log("error", items[k]?.url, e.message); }
    }
  }));
}
const dec = (s) => s.replace(/&amp;/g, "&").replace(/&#39;|&rsquo;|&#8217;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const low = (t) => (t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
const iso = (mdY) => { const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(mdY || ""); if (!m) return ""; let [mo, d] = [+m[1], +m[2]]; if (mo > 12) [mo, d] = [d, mo]; return `${m[3]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`; };

// ---------- PDF de HY-TEK → texto con columnas ----------
const TMP = join(tmpdir(), "res-pdf");
await mkdir(TMP, { recursive: true });
let tmpN = 0;
// Algunos PDF pierden las ligaduras "fi"/"fl" ("Butter ly", "Fair ield").
const fixLig = (t) => t.replace(/Butter\s?ly/g, "Butterfly").replace(/([A-Za-z])\s(ield|ields)\b/g, "$1f$2").replace(/\b(Of|Of)\s(icial)/g, "$1f$2").replace(/\bFinals\b/g, "Finals");
function pdfText(buf) {
  const f = join(TMP, `${tmpN++ % 64}.pdf`);
  writeFileSync(f, buf);
  try { return execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", f, "-"], { maxBuffer: 64e6, timeout: 60000 }).toString("utf8"); }
  catch { return ""; }
}

const NOISE = /HY-TEK'?s MEET MANAGER|Hy-Tek'?s MEET MANAGER|MEET MANAGER \d|Site License|Licensed to|^\s*Page \d+\s*$|\bPage \d+\s*$/i;
// Convierte el texto de un PDF de resultados HY-TEK en { name, start, end, events: [ev...] } (mismo formato que parseEvent).
// Otro programa de resultados: "Event #5 - 200 Free Women" / "Name  Team  [Score]  Time" (nombre y luego apellido).
const STROKE = { free: "Freestyle", back: "Backstroke", breast: "Breaststroke", fly: "Butterfly", im: "Individual Medley", medley: "Medley", freestyle: "Freestyle", backstroke: "Backstroke", breaststroke: "Breaststroke", butterfly: "Butterfly" };
const MONS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function parseAltMeet(text) {
  const lines = text.replace(/\f/g, "\n").split(/\r?\n/);
  const top = lines.filter((l) => l.trim()).slice(0, 4).map((l) => l.trim());
  const dm = /^([A-Z][a-z]{2})[a-z]*\.? (\d{1,2}),? (\d{4})(?:\s*[-–]\s*(?:([A-Z][a-z]{2})[a-z]*\.? )?(\d{1,2}),? (\d{4}))?\s*(.*)$/;
  let name = "", start = "", end = "", unit = "Yard";
  for (let i = 0; i < top.length; i++) {
    const m = dm.exec(top[i]);
    if (!m) continue;
    name = top[i - 1] || "";
    const d = (mo, dd, yy) => `${yy}-${String(MONS[mo.toLowerCase()] || 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    start = d(m[1], m[2], m[3]); end = m[5] ? d(m[4] || m[1], m[5], m[6]) : start;
    if (/met(er|re)s?\b|\bLCM\b|\bSCM\b/i.test(m[7])) unit = "Meter";
    break;
  }
  const T = /(\d{1,2}:\d{2}\.\d{2}|\d{1,3}\.\d{2}|DQ|DFS|NS|DNF|SCR|X?NT)/;
  const events = [];
  let ev = null, last = null;
  for (const raw of lines) {
    const l = raw.replace(/\s+$/, "");
    const h = /^\s*Event\s*#\s*(\d+)\s*-\s*(.+?)\s*$/i.exec(l);
    if (h) {
      const t = h[2];
      const g = /\b(Women|Girls|Female)\b/i.test(t) ? "Women" : /\b(Men|Boys|Male)\b/i.test(t) ? "Men" : "Mixed";
      const relay = /relay/i.test(t);
      const dist = /(\d{2,4})/.exec(t)?.[1];
      const st = /(freestyle|backstroke|breaststroke|butterfly|free|back|breast|fly|medley|\bim\b)/i.exec(t)?.[1]?.toLowerCase();
      const title = /diving/i.test(t) ? `${g} ${t.replace(/\b(Women|Men|Girls|Boys)\b/gi, "").trim()}` : dist && st ? `${g} ${dist} ${unit} ${relay && st === "medley" ? "Medley" : STROKE[st] || st}${relay ? " Relay" : ""}` : "";
      ev = title ? { number: +h[1], title, relay, results: [], scores: [] } : null;
      if (ev) events.push(ev);
      last = null;
      continue;
    }
    if (!ev || /^\s*Name\s{2,}/.test(l)) continue;
    const cols = l.trim().split(/\s{2,}/);
    const pl = /^(\d{1,3}|-{1,3}|\*\d{1,3}|DQ)$/.exec(cols[0])?.[1];
    if (pl && cols.length >= 3 && T.test(cols[cols.length - 1]) && new RegExp(`^${T.source}$`).test(cols[cols.length - 1])) {
      const time = cols[cols.length - 1];
      let pts = "";
      const mid = cols.slice(1, -1);
      if (mid.length >= 2 && /^(\d+(\.\d+)?|-)$/.test(mid[mid.length - 1])) pts = mid.pop().replace("-", "");
      const r = ev.relay ? { p: /^\d+$/.test(pl) ? pl : "", n: mid.join(" "), t: mid.join(" ").replace(/\s+[A-H]$/, ""), y: "", m: time, pv: "", pts, l: "", sw: [] }
        : { p: /^\d+$/.test(pl) ? pl : "", n: mid[0] || "", t: mid.slice(1).join(" "), y: "", m: time, pv: "", pts, l: "" };
      if (!ev.relay && (!r.t || /\d[:.]\d\d/.test(r.t))) continue;
      ev.results.push(r);
      last = r;
      continue;
    }
    // Relevistas: "Ellie Schrank   25.80 (25.80)".
    if (ev.relay && last?.sw && last.sw.length < 4) {
      const m = /^\s{3,}([\p{L}][\p{L}'’. -]+?)\s{2,}\d/u.exec(l);
      if (m) last.sw.push(m[1].trim());
    }
  }
  return { name, start, end, events: events.filter((e) => e.results.length) };
}
function parsePdfMeet(text, url) {
  if (/^\s*Event\s*#\s*\d+\s*-\s*\d/m.test(text) && !/^\s*\(?Event\s+\d+\s+(Women|Men|Girls|Boys)/m.test(text)) { const alt = parseAltMeet(text); if (alt.events.length) return alt; }
  // Programas, psych sheets y horarios no son resultados (llevan marcas de inscripción).
  const kind = /Meet Program|Psych Sheet|Heat Sheet|Session Report|Entry List|Entries -|Timeline|Order of Events/i.exec(text.slice(0, 3000));
  if (kind) return { name: "", start: "", end: "", events: [], why: kind[0] };
  // Dos columnas de pruebas en la misma línea: no se puede leer bien.
  // PDF a dos columnas: se corta cada página por la columna donde empieza la segunda prueba y se lee primero la izquierda.
  const TWO = /^(.*?(?:Event|#)\s*\d+\s+(?:Women|Men|Girls|Boys|Mixed)\b.{5,}?\s{3,})\(?(?:Event|#)\s*\d+\s+(?:Women|Men|Girls|Boys|Mixed)\b/i;
  const pages = text.split("\f").map((page) => {
    const ls = page.split(/\r?\n/);
    const cuts = ls.map((l) => TWO.exec(l)?.[1].length).filter(Boolean);
    if (!cuts.length) return page;
    const cut = Math.min(...cuts);
    // Las líneas de cabecera (nombre del encuentro, página) van enteras en la izquierda.
    const left = [], right = [];
    for (const l of ls) {
      if (NOISE.test(l) || /\s-\s\d{1,2}\/\d{1,2}\/\d{4}/.test(l)) { left.push(l); continue; }
      left.push(l.slice(0, cut));
      right.push(l.slice(cut));
    }
    return [...left, ...right].join("\n");
  });
  let name = "", start = "", end = "";
  const lines = [];
  for (const page of pages) {
    const ls = page.split(/\r?\n/);
    const nonEmpty = ls.filter((l) => l.trim());
    const indent = Math.min(...nonEmpty.map((l) => l.match(/^ */)[0].length), 99);
    let head = 0;
    for (const raw of ls) {
      const l = raw.slice(Math.min(indent, raw.match(/^ */)[0].length)).replace(/\s+$/, "");
      const s = l.trim();
      if (!s) continue;
      if (NOISE.test(s)) { head = 1; continue; }
      // Cabecera de cada página: "Nombre del encuentro - 10/14/2026" y "Results".
      if (head < 4 && !/^\(?Event\s+\d+/i.test(s)) {
        const m = /^(.*?)\s+-\s+(\d{1,2}\/\d{1,2}\/\d{4})(?:\s+to\s+(\d{1,2}\/\d{1,2}\/\d{4}))?\s*$/.exec(s);
        if (m) { if (!name) { name = m[1].trim(); start = iso(m[2]); end = iso(m[3]) || start; } head++; continue; }
        if (/^(Results|Results - .*|Meet Results|Final Results|Dual Meet Results|Team Scores?)$/i.test(s) && head) { head++; continue; }
      }
      head = 4;
      lines.push(l);
    }
  }
  // Pruebas: "Event 1  Women 200 Yard Medley Relay" (en páginas siguientes "(Event 1  ...)").
  const blocks = new Map();
  const order = [];
  let cur = null;
  const tail = [];
  for (const l of lines) {
    const m = /^\s*\(?\s*(?:#|Event)\s*(\d+)\s+(.*?)\)?\s*$/.exec(l);
    if (m && /yard|meter|metre|relay|diving|free|back|breast|fly|medley|IM\b/i.test(m[2]) && m[2].length < 80) {
      const key = m[1] + "|" + m[2].replace(/\s+/g, " ").toLowerCase();
      cur = blocks.get(key);
      if (!cur) { cur = { head: `Event ${m[1]} ${m[2].replace(/\s+/g, " ")}`, lines: [] }; blocks.set(key, cur); order.push(cur); }
      continue;
    }
    if (/Team Scores|Team Rankings|Combined Team|Scores\s*-|^\s*Scores\s*$/i.test(l)) cur = { lines: tail, head: "" };
    // Los PDF dejan sangría delante del puesto ("    1 Donlon, Claire"): se quita para que lo entienda el lector HY-TEK.
    if (cur) cur.lines.push(l.replace(/^\s+(?=(?:\d{1,3}|-{2,3}|\*\d{1,3})\s+[A-Za-z'])/, "").replace(/^-{3}(?=\s)/, "--"));
  }
  const events = [];
  for (const b of order) {
    const ev = parseEvent([b.head, ...b.lines].join("\n"), url);
    if (ev.title && (ev.results.length || /diving/i.test(ev.title))) events.push(ev);
  }
  // Clasificación final por equipos (al final del PDF).
  if (tail.length && events.length) {
    const ev = parseEvent(["Event 999 Team Scores", "Name  Team  Finals Time", ...tail].join("\n"), url);
    const scores = [...ev.scores];
    // Formato dual: "Bryant University   156   Fairfield University   104".
    if (!scores.length) {
      let g = "";
      for (const l of tail) {
        if (/women|female|girls/i.test(l) && !/\d{2,}/.test(l)) g = "W";
        else if (/\bmen\b|male|boys/i.test(l) && !/\d{2,}/.test(l)) g = "M";
        const ms = [...l.matchAll(/([A-Za-z][A-Za-z.'&()\- ]{2,}?)\s{1,}(\d{1,4}(?:\.\d)?)(?=\s{2,}|\s*$)/g)];
        if (ms.length >= 2) ms.map((x) => ({ t: x[1].trim(), pts: x[2] })).sort((a, b) => b.pts - a.pts).forEach((x, i) => scores.push({ p: i + 1, t: x.t, pts: x.pts, ...(g ? { g } : {}) }));
      }
    }
    if (scores.length) events[events.length - 1].scores = scores;
  }
  return { name, start, end, events };
}

// ---------- Página HY-TEK (HTML) → mismo formato ----------
async function parseHtmlMeet(url) {
  const idx = await get(normalizeMeetUrl(url));
  if (!idx) return null;
  const meet = parseIndex(idx.body, normalizeMeetUrl(url));
  const evs = uniqueEvents(meet);
  if (!evs.length) return null;
  const events = [];
  for (const e of evs) {
    const h = await get(e.url);
    if (!h) continue;
    const ev = parseEvent(h.body, e.url);
    if (ev.title && ev.results.length) events.push(ev);
  }
  return { name: meet.name, start: meet.start || "", end: meet.end || meet.start || "", events };
}

// ---------- Entradas ----------
const cal = await readJSON("web/data/calendario.json", { cal: {}, src: {} });
const archivo = await readJSON("web/data/archivo.json", { meets: [] });
const plant = (await readJSON("web/data/plantillas.json", { plant: {} })).plant;
const idx = await readJSON("web/data/encuentros.json", { v: 1, meets: [], done: {} });
const done = process.env.FRESH ? {} : idx.done || {};
// Nueva versión del lector: se vuelve a leer todo (y se quitan de los nadadores las marcas de la versión anterior).
const VER = 6;
const RESET = idx.v !== VER;
if (RESET) { for (const k of Object.keys(done)) delete done[k]; idx.meets = []; idx.pastDone = []; }
// "Loyola (MD) vs NCAA Division I Championships" → el nombre es el del campeonato, no un dual.
const EVENTY = /\b(championships?|invitational|invite|classic|open|ncaa|nationals?|conference|cup|relays|shootout|showdown|frosh)\b/i;
const RENAME = /^(.+?) vs (.*\b(championships?|invitational|invite|classic|open|ncaa|nationals?|conference|cup|relays|shootout|showdown)\b.*)$/i;
let renamed = 0;
for (const m of idx.meets || []) {
  const r = RENAME.exec(m.n);
  if (!r || !m.u.some((u) => r[1] === u)) continue;
  m.n = r[2];
  const f = `web/data/m/${m.id.slice(2)}.json`;
  const d = await readJSON(f, null);
  if (d) { d.n = m.n; await writeFile(f, JSON.stringify(d)); }
  renamed++;
}
const meetsById = new Map((idx.meets || []).map((m) => [m.id, m]));
if (RESET) await rm("web/data/m", { recursive: true, force: true });
const inArchive = new Set(archivo.meets.map((m) => m.url.split("#")[0]));
const skipHost = /swimcloud\.com|active\.com|meetmobile|usaswimming\.org|swimmingworld|swimswam\.com|youtube|facebook|twitter|instagram|flickr|smugmug/i;
const isPdf = (u) => /\.pdf($|\?)/i.test(u);
const isHy = (u) => /sidearmstats|evtindex\.htm|\/index\.htm$|lastevt\.htm/i.test(u);

const y = new Date().getUTCFullYear();
const seasonY = new Date().getUTCMonth() >= 7 ? y : y - 1; // 2026 = temporada 2026-27
const label = (sy) => `${sy}-${String(sy + 1).slice(2)}`;
const cand = [];
const add = (u, uni, g, d, o, season) => {
  if (!u || skipHost.test(u) || done[u] !== undefined) return;
  if (!isPdf(u) && !isHy(u)) return;
  if (isHy(u) && inArchive.has(normalizeMeetUrl(u))) return; // ya se abre en directo desde el archivo
  if (cand.some((c) => c.url === u)) return;
  cand.push({ url: u, uni, g, d, o, season });
};
for (const [uni, games] of Object.entries(cal.cal || {})) for (const g of games) { add(g.res, uni, g.g || "", g.d, g.o, label(seasonY)); if (g.live && g.live !== g.res) add(g.live, uni, g.g || "", g.d, g.o, label(seasonY)); }
console.log("enlaces de esta temporada por leer:", cand.length);

// Temporadas anteriores: calendario de cada año en la web de la universidad (Sidearm: /schedule/2025-26).
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function pastGames(html, base, sy) {
  const out = [];
  for (const b of html.split(/<(?:li|div)[^>]+class="sidearm-schedule-game(?=[\s"])/i).slice(1)) {
    const opp = dec(/sidearm-schedule-game-opponent-name[^>]*>([\s\S]*?)<\/div>/i.exec(b)?.[1] || "");
    const aria = /aria-label="[^"]*? on ([A-Z][a-z]+ \d{1,2}, \d{4})/i.exec(b)?.[1] || "";
    let d = aria ? new Date(aria + " UTC").toISOString().slice(0, 10) : "";
    if (!d) {
      const m = /sidearm-schedule-game-opponent-date[^>]*>\s*(?:<[^>]+>\s*)*([A-Z][a-z]{2})[a-z]*\.? (\d{1,2})/.exec(b);
      if (m && MON[m[1].toLowerCase()]) { const mo = MON[m[1].toLowerCase()]; d = `${mo >= 8 ? sy : sy + 1}-${String(mo).padStart(2, "0")}-${m[2].padStart(2, "0")}`; }
    }
    for (const m of b.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      let href;
      try { href = new URL(m[1].replace(/&amp;/g, "&"), base).href; } catch { continue; }
      if (isPdf(href) || (/results/i.test(dec(m[2])) && isHy(href))) out.push({ href, d, o: opp });
    }
  }
  return out;
}
const pastTodo = [];
for (const [uni, list] of Object.entries(cal.src || {})) for (const e of list) {
  const [g, url] = [e.split("|")[0], e.slice(e.indexOf("|") + 1)];
  for (let k = 1; k <= SEASONS_BACK; k++) pastTodo.push({ uni, g, url: url.replace(/\/schedule.*$/, "/schedule/" + label(seasonY - k)), sy: seasonY - k });
}
const pastDone = new Set(idx.pastDone || []);
const pastList = pastTodo.filter((p) => !pastDone.has(p.url));
await pool(pastList, 8, async (p) => {
  const r = await get(p.url);
  if (!r) return;
  if (!r.url.includes(label(p.sy))) { pastDone.add(p.url); return; } // la web no tiene ese año
  for (const x of pastGames(r.body, r.url, p.sy)) add(x.href, p.uni, p.g, x.d, x.o, label(p.sy));
  pastDone.add(p.url);
});
// Universidad de un enlace sin calendario: por el dominio de su web de deportes.
const hostUni = {};
for (const [uni, list] of Object.entries(cal.src || {})) for (const e of list) { const h = /https?:\/\/([^/]+)/.exec(e)?.[1]; if (h) hostUni[h] = uni; }
const uniOf = (u) => hostUni[/https?:\/\/([^/]+)/.exec(u)?.[1]] || "";
const seasonOf = (d) => { const [yy, mm] = (d || "").split("-").map(Number); return yy ? label(mm >= 8 ? yy : yy - 1) : ""; };
// Volver a leer los documentos que antes no dieron resultados (tras mejorar el lector).
if (process.env.RETRY_EMPTY) for (const [u, v] of Object.entries(done)) if (v === 0 && !cand.some((c) => c.url === u)) { delete done[u]; cand.push({ url: u, uni: uniOf(u), g: "", d: "", o: "", season: "" }); }
// Prueba con enlaces concretos (no guarda).
if (process.env.URLS) { cand.length = 0; for (const u of process.env.URLS.split(/\s+/).filter(Boolean)) cand.push({ url: u, uni: "", g: "", d: "", o: "", season: "" }); }
console.log("calendarios de años anteriores leídos:", pastDone.size, "de", pastTodo.length, "· enlaces por leer en total:", cand.length);

// ---------- Descarga y lectura ----------
const sigOf = (m) => {
  const ev = m.events.find((e) => !e.relay && e.results.length >= 2) || m.events[0];
  return [m.start, ev.title, ...ev.results.slice(0, 3).map((r) => low(r.n) + r.m)].join("|");
};
const compact = (ev) => ({
  no: ev.number, ti: ev.title, ...(ev.relay ? { r: 1 } : {}),
  res: ev.results.map((r) => [r.p, r.n, r.t, r.y || "", r.m, r.pv || "", r.pts || "", r.l || "", ...(r.sw?.length ? [r.sw] : [])]),
  ...(ev.scores.length ? { sc: ev.scores.map((s) => [s.p, s.t, s.pts, s.g || ""]) } : {}),
});
await mkdir("web/data/m", { recursive: true });
let ok = 0, empty = 0, fail = 0, samples = 0;
const dbg = { np: 0, pe: 0 };
const whyC = {};
const newMeets = [];
await pool(cand, 6, async (c) => {
  let meet = null;
  if (isPdf(c.url)) {
    let r = await get(c.url, true);
    // Sidearm: /documents/...pdf es una página que enseña el PDF; el archivo real está en su CDN.
    if (r && /html/i.test(r.type)) {
      const html = r.body.toString("utf8");
      const links = [...html.matchAll(/(?:https?:)?\/\/[^"'\s<>()]+?\.pdf(?:\?[^"'\s<>]*)?/gi)].map((m) => (m[0].startsWith("//") ? "https:" + m[0] : m[0]).replace(/&amp;/g, "&"));
      const file = c.url.split("/").pop().split("?")[0].toLowerCase();
      const best = links.find((l) => l.toLowerCase().includes(file) && l !== c.url) || links.find((l) => /cloudfront|sidearm/i.test(l) && l !== c.url);
      if (best) r = await get(best, true);
      else if (DEBUG && dbg.np < 6) console.log("SIN-ENLACE-PDF", c.url, (html.match(/[^"'\s]*documents[^"'\s]*/g) || []).slice(0, 8).join(" "));
    }
    if (!r) { if (DEBUG && fail < 4) console.log("FALLO", c.url); fail++; return; }
    if (!/pdf/i.test(r.type) && r.body.slice(0, 4).toString() !== "%PDF") { if (DEBUG && dbg.np++ < 6) console.log("NO-PDF", c.url, "→", r.url, r.type, r.body.slice(0, 200).toString().replace(/\s+/g, " ")); done[c.url] = 0; empty++; return; }
    const text = fixLig(pdfText(r.body));
    if (DEBUG > 1 && samples < 3 && text) { samples++; console.log("=== MUESTRA", c.url, "\n" + text.split("\n").slice(0, 70).join("\n")); }
    meet = parsePdfMeet(text, c.url);
    if (DEBUG) meet.text = text;
  } else {
    meet = await parseHtmlMeet(c.url);
    if (!meet) { fail++; return; }
  }
  const swims = meet.events.reduce((a, e) => a + e.results.length, 0);
  if (!meet.events.length || swims < 4) { whyC[meet.why || (meet.events.length ? "pocas filas" : "sin pruebas")] = (whyC[meet.why || (meet.events.length ? "pocas filas" : "sin pruebas")] || 0) + 1; if (DEBUG && dbg.pe++ < 6) console.log("SIN-PRUEBAS", c.url, meet.events.length, swims, "\n" + (meet.text || "").split("\n").slice(0, process.env.URLS ? (cand.length === 1 ? 260 : 90) : 25).join("\n")); done[c.url] = 0; empty++; return; }
  meet.start ||= c.d || "";
  meet.end ||= meet.start;
  meet.name = (meet.name || "").replace(/(\s+-\s+copied)+$/i, "").trim();
  if (!meet.name || meet.name.length < 4 || /^(results?|dual meet)$/i.test(meet.name)) meet.name = !c.o ? (decodeURIComponent(c.url.split("/").pop().replace(/\.pdf.*$/i, "")).replace(/[_+]+/g, " ").replace(/\b(results?|scores?|final)\b/gi, "").replace(/\s+/g, " ").trim() || c.uni) : EVENTY.test(c.o) ? c.o : `${c.uni} ${/^(at|vs)\b/i.test(c.o) ? "" : "vs "}${c.o}`.replace(/\s+/g, " ");
  const id = "r:" + createHash("sha1").update(sigOf(meet)).digest("hex").slice(0, 12);
  done[c.url] = id;
  const prev = meetsById.get(id);
  if (prev) { if (c.uni && !prev.u.includes(c.uni)) prev.u.push(c.uni); return; }
  const entry = { id, n: meet.name.slice(0, 120), d: meet.start, e: meet.end, u: [c.uni].filter(Boolean), s: c.season || seasonOf(meet.start), src: c.url, ev: meet.events.length };
  meetsById.set(id, entry);
  newMeets.push({ entry, meet });
  await writeFile(`web/data/m/${id.slice(2)}.json`, JSON.stringify({ n: entry.n, d: entry.d, e: entry.e, u: entry.u, src: c.url, ev: meet.events.map(compact) }));
  ok++;
});
console.log("motivos sin resultados:", JSON.stringify(whyC));
console.log("leídos ahora:", ok, "sin resultados:", empty, "fallos:", fail, "· encuentros guardados:", meetsById.size, "· minutos:", ((Date.now() - T0) / 60e3).toFixed(1));

// ---------- Mejores marcas ----------
const secs = (t) => { const m = /^(?:(\d+):)?(\d+\.\d+)/.exec((t || "").replace(/^[xX*]/, "")); return m ? (+m[1] || 0) * 60 + +m[2] : Infinity; };
const short = (title) => title.replace(/^(Women|Men|Girls|Boys|Mixed)\s+/i, "").replace(/\s+Yard\s+/i, " Y ").replace(/\s+LC\s+Meter\s+|\s+SC\s+Meter\s+|\s+Meter\s+/i, " M ").replace(/Freestyle/i, "Free").replace(/Backstroke/i, "Back").replace(/Breaststroke/i, "Breast").replace(/Butterfly/i, "Fly").replace(/Individual Medley/i, "IM").replace(/\s+(Time Trial|Swim-?off|Prelims|Finals|Consolation|Bonus)\b.*$/i, "").trim();
const sexOf = (t) => (/women|girls/i.test(t) ? "W" : /\bmen\b|boys/i.test(t) ? "M" : "");
const sw = await readJSON("web/data/nadadores.json", { v: 2, swimmers: [], done: [] });
const keyOf = (n, t) => (n + "|" + t).toLowerCase().replace(/\s+/g, " ");
if (RESET) {
  sw.mi = {};
  sw.swimmers = sw.swimmers.map((s) => ({ ...s, b: Object.fromEntries(Object.entries(s.b).filter(([, v]) => !String(v[2] || "").startsWith("r:"))), m: s.m.filter((x) => !x.startsWith("r:")) })).filter((s) => Object.keys(s.b).length || s.m.length);
}
const map = new Map(sw.swimmers.map((s) => [keyOf(s.n, s.t), s]));
// Nadadores actuales (plantillas): los de temporadas pasadas solo se añaden si siguen en una plantilla.
const current = new Set();
for (const p of Object.values(plant)) for (const list of Object.values(p)) for (const e of list) {
  const tk = low(Array.isArray(e) ? e[0] : e).split(" ");
  if (tk.length >= 2) current.add(tk[tk.length - 1] + "|" + tk[0].slice(0, 3));
}
const mi = sw.mi || {};
for (const m of meetsById.values()) if (mi[m.id]) mi[m.id][0] = m.n;
console.log("renombrados:", renamed);
let marks = 0;
for (const { entry, meet } of newMeets) {
  const past = entry.s !== label(seasonY);
  mi[entry.id] = [entry.n, entry.d];
  for (const ev of meet.events) {
    if (ev.relay || /diving/i.test(ev.title)) continue;
    const evn = short(ev.title);
    const em = /^(\d+) ([YM]) (Free|Back|Breast|Fly|IM)$/.exec(evn);
    if (!em) continue;
    const dist = +em[1];
    for (const r of ev.results) {
      if (!r.n || !r.t || r.t.length < 2 || /\d[:.]\d\d/.test(r.t) || !r.m || secs(r.m) === Infinity || !/^[\p{L}][\p{L}'’.,\- ]+$/u.test(r.n.trim()) || /^[A-Z0-9-]+$/.test(r.n.trim())) continue;
      // Ritmo imposible (segundos por yarda/metro): error de lectura.
      const pc = secs(r.m) / dist;
      if (pc < 0.36 || pc > 1.4) continue;
      const name = (r.n.includes(",") ? r.n.split(",").map((x) => x.trim()).filter(Boolean).reverse().join(" ") : r.n).replace(/\s+/g, " ").trim().replace(/\s+[A-Z]\.?(?=\s)/g, "");
      const tk = low(name).split(" ");
      if (tk.length < 2) continue;
      const k = keyOf(name, r.t);
      let s = map.get(k);
      if (!s) {
        const last = r.n.includes(",") ? low(r.n.split(",")[0]).split(" ").pop() : tk[tk.length - 1];
        if (past && !current.has(last + "|" + tk[0].slice(0, 3))) continue;
        s = { n: name, t: r.t, g: sexOf(ev.title), y: "", b: {}, m: [] };
        if (r.n.includes(",")) s.l = r.n.split(",")[0].trim();
        map.set(k, s);
      }
      if (!past && r.y && /^(FR|SO|JR|SR|5Y|GR)$/i.test(r.y)) s.y = r.y.toUpperCase();
      const t = r.m.replace(/^[xX*]/, "").replace(/[A-Za-z!#$&*@^]+$/, "");
      if (!s.b[evn] || secs(t) < secs(s.b[evn][0])) { s.b[evn] = [t, entry.n, entry.id]; marks++; }
      if (!s.m.includes(entry.id)) s.m.push(entry.id);
    }
  }
}
// Las competiciones de cada nadador, de la más antigua a la más reciente (se muestran las últimas).
const dateOfM = (x) => (mi[x] ? mi[x][1] : (archivo.meets.find((a) => a.name === x)?.start || "")) || "";
const slim = (b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v[2] && mi[v[2]] ? [v[0], "", v[2]] : v]));
const list = [...map.values()].map(({ y: yy, ...s }) => ({ ...s, ...(yy ? { y: yy } : {}), b: slim(s.b), m: s.m.slice().sort((a, b) => dateOfM(a).localeCompare(dateOfM(b))).slice(-12) }));
list.sort((a, b) => a.n.localeCompare(b.n));
await writeFile("web/data/nadadores.json", JSON.stringify({ ...sw, swimmers: list, mi }));
const meets = [...meetsById.values()].sort((a, b) => (b.d || "").localeCompare(a.d || ""));
await writeFile("web/data/encuentros.json", JSON.stringify({ v: VER, updated: new Date().toISOString().slice(0, 10), meets, done, pastDone: [...pastDone] }));
console.log("nadadores:", list.length, "marcas nuevas o mejoradas:", marks, "· con marcas:", list.filter((s) => Object.keys(s.b).length).length);
console.log("ejemplos:", meets.slice(0, 15).map((m) => `${m.d} ${m.n} [${m.u.join(", ")}] ${m.ev} pruebas`).join("\n"));
await rm(TMP, { recursive: true, force: true });
