// Una vez al día, desde la web oficial de cada universidad (páginas públicas de calendario y plantilla):
// - web/data/calendario.json: competiciones de la temporada (duales incluidos), resultado y enlaces (PDF, crónica, directo).
// - web/data/plantillas.json: nombres de la plantilla oficial (para mostrar el equipo y corregir nombres cortados).
// - escudo oficial de la web si la universidad no tiene escudo (se guarda en unis.json).
// - enlaces a resultados en directo HY-TEK que aparezcan en el calendario → candidatos para archivo.json.
import { readFile, writeFile } from "node:fs/promises";

const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" };
const data = JSON.parse(await readFile("web/data/unis.json", "utf8"));
const unis = data.unis;
const PATHS = {
  "": ["/sports/swimming-and-diving", "/sports/swimming", "/sports/swim-and-dive", "/sports/swimming-diving"],
  M: ["/sports/mens-swimming-and-diving", "/sports/mens-swimming"],
  W: ["/sports/womens-swimming-and-diving", "/sports/womens-swimming"],
};
async function get(url) {
  try {
    const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    return { url: r.url, html: await r.text() };
  } catch {
    return null;
  }
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      try { await fn(items[k]); } catch {}
    }
  }));
}
const dec = (s) => s.replace(/&amp;/g, "&").replace(/&#39;|&rsquo;|&#8217;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
function jsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1]);
      const walk = (x) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === "object") { out.push(x); if (x.item) walk(x.item); if (x["@graph"]) walk(x["@graph"]); if (x.itemListElement) walk(x.itemListElement); } };
      walk(j);
    } catch {}
  }
  return out;
}
const seasonStart = (() => { const d = new Date(); const y = d.getUTCMonth() >= 7 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; return `${y}-08-01`; })();
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function dateOf(t) {
  const m = /^([A-Z][a-z]{2})[a-z]*\.? (\d{1,2})/.exec(t || "");
  if (!m || !MON[m[1].toLowerCase()]) return "";
  const mo = MON[m[1].toLowerCase()];
  const y0 = +seasonStart.slice(0, 4);
  const y = mo >= 8 ? y0 : y0 + 1;
  return `${y}-${String(mo).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}
const RESULTS_LINK = /\/(evtindex|index|\d*lastevt)\.htm$/i;

function schedule(html, base, uname) {
  const games = [];
  const live = new Set();
  // a) Bloques HTML clásicos de Sidearm (traen resultado y enlaces).
  const blocks = html.split(/<(?:li|div)[^>]+class="sidearm-schedule-game(?=[\s"])/i).slice(1);
  for (const b of blocks) {
    const opp = dec(/sidearm-schedule-game-opponent-name[^>]*>([\s\S]*?)<\/div>/i.exec(b)?.[1] || "");
    if (!opp) continue;
    const aria = /aria-label="[^"]*? on ([A-Z][a-z]+ \d{1,2}, \d{4})/i.exec(b)?.[1] || "";
    const dateTxt = dec(/sidearm-schedule-game-opponent-date[^>]*>([\s\S]*?)<\/div>/i.exec(b)?.[1] || "");
    const at = /sidearm-schedule-game-away[^>]*>\s*at\s*</i.test(b) ? "at" : /sidearm-schedule-game-home|vs\.?\s*</i.test(b) ? "vs" : "";
    const result = dec(/sidearm-schedule-game-result[^>]*>([\s\S]*?)<\/div>/i.exec(b)?.[1] || "").replace(/^Results?\s*/i, "");
    const links = {};
    for (const m of b.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const t = dec(m[2]);
      let href;
      try { href = new URL(m[1].replace(/&amp;/g, "&"), base).href; } catch { continue; }
      if (/\.pdf($|\?)/i.test(href) || /results/i.test(t)) links.res ||= href;
      if (/recap/i.test(t)) links.recap ||= href;
      if (RESULTS_LINK.test(new URL(href).pathname)) { links.live = href; live.add(href); }
      if (/live (stats|results)/i.test(t) && !links.live) links.live = href;
    }
    games.push({ d: aria ? new Date(aria + " UTC").toISOString().slice(0, 10) : dateOf(dateTxt), dt: dateTxt.slice(0, 40), o: opp, at, r: result.slice(0, 60), ...links });
  }
  // b) Datos estructurados (schema.org) si no hay bloques clásicos.
  if (!games.length) {
    for (const e of jsonLd(html).filter((x) => x["@type"] === "SportsEvent")) {
      const home = e.homeTeam?.name || "", away = e.awayTeam?.name || "";
      const self = /university|college/i.test(home) && home.toLowerCase().includes(uname.toLowerCase().split(" ")[0]);
      const at = / At /.test(e.name || "") ? "at" : "vs";
      const opp = at === "at" ? (self ? away : away || home) : away;
      games.push({ d: (e.startDate || "").slice(0, 10), o: opp || e.name || "", at, ...(e.url ? { recap: e.url } : {}) });
    }
  }
  for (const m of html.matchAll(/href="([^"]+)"/gi)) {
    try { const u = new URL(m[1].replace(/&amp;/g, "&"), base); if (RESULTS_LINK.test(u.pathname) && !/\/sports\//.test(u.pathname)) live.add(u.href); } catch {}
  }
  return { games: games.filter((g) => !g.d || g.d >= seasonStart), live: [...live] };
}
function roster(html, base) {
  const out = new Map();
  const abs = (u) => { try { return new URL(u.replace(/&amp;/g, "&"), base).href; } catch { return ""; } };
  // Webs nuevas de Sidearm: tarjetas de persona con "Nombre full bio" y su foto.
  for (const b of html.split(/data-test-id="s-person-details__root"/).slice(1)) {
    const n = /aria-label="([^"]+?) full bio"/.exec(b)?.[1];
    if (!n) continue;
    const img = /<img[^>]+src="(https:\/\/images\.sidearmdev\.com\/[^"]+)"/.exec(b.slice(0, 6000))?.[1] || "";
    if (!out.has(dec(n))) out.set(dec(n), img ? abs(img) : "");
  }
  // Webs clásicas: datos estructurados (schema.org Person) con foto.
  if (!out.size) for (const p of jsonLd(html).filter((x) => x["@type"] === "Person" && x.name)) out.set(dec(p.name), p.image?.url ? abs(p.image.url) : "");
  if (!out.size) for (const m of html.matchAll(/aria-label="([^"]+?) - View Profile"/g)) out.set(dec(m[1]), "");
  if (!out.size) for (const m of html.matchAll(/class="sidearm-roster-player-name"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/gi)) out.set(dec(m[1]), "");
  return [...out].filter(([n]) => /^[\p{L}'’.\- ]{3,60}$/u.test(n) && n.includes(" ")).map(([n, img]) => (img ? [n, img] : [n]));
}

const cal = {}, plant = {}, liveLinks = new Set();
let logosAdded = 0;
const todo = unis.filter((u) => u.web);
await pool(todo, 10, async (u) => {
  const base = u.web.replace(/^(https?:\/\/[^/]+).*$/, "$1");
  const want = u.men && u.women ? ["", "M", "W"] : u.men ? ["", "M"] : ["", "W"];
  const games = [], names = { M: [], W: [], "": [] };
  let siteLogo = "";
  let foundCombined = false;
  for (const who of want) {
    if (who && foundCombined) break;
    for (const p of PATHS[who]) {
      const s = await get(base + p + "/schedule");
      let got = false;
      if (s && /schedule/i.test(s.url)) {
        const r = schedule(s.html, s.url, u.n);
        for (const g of r.games) if (!games.some((x) => x.d === g.d && x.o === g.o)) games.push(who ? { ...g, g: who } : g);
        r.live.forEach((l) => liveLinks.add(l));
        siteLogo ||= /"image":\{"url":"(https?:\/\/[^"]+\/images\/logos\/site\/[^"]+)"/.exec(s.html)?.[1] || "";
        got = r.games.length > 0;
      }
      const ro = await get(base + p + "/roster");
      if (ro && /roster/i.test(ro.url)) {
        const list = roster(ro.html, ro.url);
        if (list.length) { names[who] = list; got = true; }
      }
      if (got) {
        if (!who && names[""].length) foundCombined = true;
        break;
      }
    }
  }
  if (games.length) cal[u.n] = games.sort((a, b) => (a.d || "").localeCompare(b.d || "")).slice(0, 40);
  const all = [...names[""], ...names.M, ...names.W];
  if (all.length) plant[u.n] = { ...(names.M.length ? { M: names.M } : {}), ...(names.W.length ? { W: names.W } : {}), ...(names[""].length ? { X: names[""] } : {}) };
  if (siteLogo && (!u.logo || u._badLogo)) { u.logo = siteLogo; logosAdded++; }
});
console.log("calendarios:", Object.keys(cal).length, "plantillas:", Object.keys(plant).length, "nadadores en plantillas:", Object.values(plant).reduce((a, p) => a + (p.M?.length || 0) + (p.W?.length || 0) + (p.X?.length || 0), 0), "con foto:", Object.values(plant).flatMap((p) => [...(p.M || []), ...(p.W || []), ...(p.X || [])]).filter((x) => x[1]).length, "D-I con plantilla:", unis.filter((u) => u.div === "D1" && plant[u.n]).length, "de", unis.filter((u) => u.div === "D1").length, "escudos añadidos:", logosAdded, "enlaces directo:", liveLinks.size);
console.log("ejemplo Drury:", JSON.stringify(cal.Drury || []).slice(0, 800));
console.log("enlaces:", [...liveLinks].slice(0, 30).join(" "));
await writeFile("web/data/calendario.json", JSON.stringify({ updated: new Date().toISOString().slice(0, 10), live: [...liveLinks], cal }));
await writeFile("web/data/plantillas.json", JSON.stringify({ updated: new Date().toISOString().slice(0, 10), plant }));
await writeFile("web/data/unis.json", JSON.stringify(data));
