// Genera web/data/unis.json: universidades con equipo de natación (NCAA D-I, D-II, D-III y NAIA).
// Fuente: Wikipedia (CC BY-SA), "List of college swimming and diving teams" y los artículos de cada
// universidad (ciudad), de su programa deportivo (escudo) y de su equipo de natación (entrenador).
import { writeFile } from "node:fs/promises";

const API = "https://en.wikipedia.org/w/api.php";
const UA = { headers: { "User-Agent": "natacion-usa/0.5 (app personal; datos de Wikipedia)" } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params) {
  const body = new URLSearchParams({ format: "json", formatversion: "2", maxlag: "5", ...params });
  let last = "";
  for (let i = 0; i < 5; i++) {
    const r = await fetch(API, { method: "POST", body, headers: { ...UA.headers, "Content-Type": "application/x-www-form-urlencoded" } });
    if (r.ok) {
      const d = await r.json();
      if (!d.error) return d;
      last = JSON.stringify(d.error).slice(0, 200);
      if (d.error.code !== "maxlag") break;
    } else last = `HTTP ${r.status}`;
    await sleep(2000 * (i + 1));
  }
  throw new Error("Wikipedia: " + last + " " + JSON.stringify(params).slice(0, 120));
}
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      try { out[k] = await fn(items[k]); } catch (e) { out[k] = null; }
    }
  }));
  return out;
}
async function section0(title) {
  const d = await api({ action: "parse", page: title, prop: "wikitext", section: "0", redirects: "1" });
  return d.parse?.wikitext || "";
}

// Quita plantillas {{...}} anidadas, conservando {{sort|x|Y}} → Y, {{Y}} → Y, {{N}} → N.
function stripTemplates(s) {
  let prev;
  do {
    prev = s;
    s = s
      .replace(/\{\{\s*sort\s*\|[^{}|]*\|([^{}]*)\}\}/gi, "$1")
      .replace(/\{\{\s*(Y|Yes|Ya|Tick|Check)\s*\}\}/gi, "Y")
      .replace(/\{\{\s*(N|No|Na|Cross|X mark)\s*\}\}/gi, "N")
      .replace(/\{\{[^{}]*\}\}/g, "");
  } while (s !== prev);
  return s;
}
function cell(raw) {
  const s = stripTemplates(raw).replace(/<ref[\s\S]*?(<\/ref>|\/>)/gi, "").replace(/<[^>]+>/g, " ");
  const link = /\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/.exec(s);
  const text = s.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]]+)\]\]/g, "$1").replace(/'''?/g, "").replace(/\s+/g, " ").trim();
  return { text, link: link ? link[1].trim() : "" };
}

function parseTables(wikitext) {
  const out = [];
  for (const tbl of wikitext.split(/\n\{\|/).slice(1)) {
    const body = tbl.split(/\n\|\}/)[0];
    const rows = body.split(/\n\|-[^\n]*/);
    const head = rows.shift();
    const hl = head.split("\n").find((l) => l.startsWith("!"));
    if (!hl) continue;
    const cols = hl.replace(/^!/, "").split(/!!/).map((c) => stripTemplates(c).replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().toLowerCase());
    for (const row of rows) {
      const lines = row.split("\n").filter((l) => l.startsWith("|") && !l.startsWith("|}"));
      if (!lines.length) continue;
      const cells = lines.map((l) => l.slice(1)).join("||").split("||").map(cell);
      if (cells.length < cols.length - 1) continue;
      const rec = {};
      cols.forEach((c, i) => (rec[c] = cells[i] || { text: "", link: "" }));
      out.push(rec);
    }
  }
  return out;
}

const TWO_WORD = /\b(Golden|Blue|Red|Big|Purple|Fighting|Lady|Black|Green|Crimson|Mountain|Sea|Scarlet|Yellow|Thundering|Screaming|Flying|Runnin'?|Running|Ragin'?|Mean|Great|Gray|Grey|Silver|Orange|Royal|Nittany|Tar|Sun|Horned|Wolf)\s+\S+$/;
function shortFromTeam(team) {
  const m = TWO_WORD.exec(team);
  if (m && team.split(" ").length > 2) return team.slice(0, m.index).trim();
  const w = team.split(" ");
  return w.length > 1 ? w.slice(0, -1).join(" ") : team;
}
const has = (t) => !!t && !/^(N|No|—|-|–)$/i.test(t.trim());

const page = await api({ action: "parse", page: "List_of_college_swimming_and_diving_teams", prop: "wikitext" });
const wt = page.parse.wikitext;
const SECTIONS = [["D1", /==\s*NCAA Division I\s*==/], ["D2", /==\s*NCAA Division II\s*==/], ["D3", /==\s*NCAA Division III\s*==/], ["NAIA", /==\s*NAIA\s*==/], ["END", /==\s*NJCAA\s*==/]];
const pos = SECTIONS.map(([k, re]) => [k, wt.search(re)]);
const unis = [];
for (let i = 0; i < pos.length - 1; i++) {
  const [div, start] = pos[i];
  const end = pos.slice(i + 1).map(([, p]) => p).find((p) => p > start) ?? wt.length;
  for (const r of parseTables(wt.slice(start, end))) {
    const g = (re) => Object.entries(r).find(([k]) => re.test(k))?.[1] || { text: "", link: "" };
    const inst = g(/^institution/);
    if (!inst.text) continue;
    const teamName = g(/^team name|^athletic brand/);
    const athletic = g(/^athletic team/);
    const nick = g(/^nickname/);
    const men = g(/^men/);
    const women = g(/^women/);
    const conf = g(/^conf/);
    const state = g(/^st/);
    const name = teamName.text || (athletic.text ? shortFromTeam(athletic.text) : inst.text);
    const isNaia = div === "NAIA";
    unis.push({
      n: name,
      full: inst.text,
      div,
      nick: nick.text || (athletic.text ? athletic.text.slice(shortFromTeam(athletic.text).length).trim() : ""),
      men: isNaia ? has(men.text) : has(men.text),
      women: isNaia ? has(women.text) : has(women.text),
      cm: isNaia ? (has(men.text) ? conf.text : "") : has(men.text) ? men.text : "",
      cw: isNaia ? (has(women.text) ? conf.text : "") : has(women.text) ? women.text : "",
      diving: has(g(/^diving/).text),
      st: state.text.replace(/[^A-Z]/g, "").slice(0, 2),
      _inst: inst.link || inst.text,
      _ath: athletic.link || athletic.text || nick.link || "",
    });
  }
}
console.log("universidades:", unis.length, Object.fromEntries(["D1", "D2", "D3", "NAIA"].map((d) => [d, unis.filter((u) => u.div === d).length])));

// Consultas por lotes de 50 títulos.
async function batch(titles, params) {
  const res = {};
  const list = [...new Set(titles.filter(Boolean))];
  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50);
    let d;
    try {
      d = await api({ action: "query", titles: chunk.join("|"), redirects: "1", ...params });
    } catch (e) {
      console.log("lote omitido:", e.message);
      continue;
    }
    const map = new Map(chunk.map((t) => [t, t]));
    for (const n of d.query.normalized || []) map.set(n.from, n.to);
    const red = new Map((d.query.redirects || []).map((x) => [x.from, x.to]));
    const pages = new Map((d.query.pages || []).map((p) => [p.title, p]));
    for (const t of chunk) {
      let k = map.get(t) || t;
      k = red.get(k) || k;
      if (pages.get(k) && !pages.get(k).missing) res[t] = pages.get(k);
    }
    await sleep(300);
  }
  return res;
}
const content = (p) => p?.revisions?.[0]?.slots?.main?.content || p?.revisions?.[0]?.content || "";
function infobox(text, keys) {
  for (const k of keys) {
    const m = new RegExp(`\\|\\s*${k}\\s*=\\s*([^\\n]*)`, "i").exec(text);
    if (m) {
      const v = cell(m[1]).text.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
      if (v && !/^\W*$/.test(v)) return v;
    }
  }
  return "";
}

// Escudos: imagen principal del artículo del programa deportivo.
const ath = await batch(unis.map((u) => u._ath), { prop: "pageimages", piprop: "thumbnail", pithumbsize: "160" });
// Ciudad y web: infobox del artículo de la universidad (una petición por artículo).
const instTitles = [...new Set(unis.map((u) => u._inst))];
const instText = {};
await pool(instTitles, 6, async (t) => (instText[t] = await section0(t)));
// Entrenadores: artículos del equipo de natación, si existen.
const swimTitles = [];
for (const u of unis) {
  const base = u._ath || `${u.n} ${u.nick}`.trim();
  u._swim = [`${base} swimming and diving`, `${base} men's swimming and diving`, `${base} women's swimming and diving`];
  swimTitles.push(...u._swim);
}
const swimExist = await batch(swimTitles, { prop: "info" });
const swimText = {};
await pool(Object.keys(swimExist), 6, async (t) => (swimText[t] = await section0(swimExist[t].title)));
console.log("artículos: universidades", Object.values(instText).filter(Boolean).length, "natación", Object.keys(swimText).length);

for (const u of unis) {
  const a = ath[u._ath];
  const it = instText[u._inst] || "";
  u.logo = a?.thumbnail?.source || "";
  u.city = infobox(it, ["city", "location"]).replace(/,\s*(U\.S\.|United States|USA)$/, "").split(",").slice(0, 2).join(",").trim();
  u.web = (/\|\s*website\s*=\s*[^\n]*?(https?:\/\/[^\s|}\]]+|[\w.-]+\.edu)/i.exec(it) || [])[1] || "";
  u.wiki = "https://en.wikipedia.org/wiki/" + encodeURIComponent((u._ath || u._inst).replace(/ /g, "_"));
  const [both, menT, womenT] = u._swim.map((t) => swimText[t] || "");
  u.coach = infobox(both, ["head_coach", "headcoach", "coach"]);
  u.coachM = infobox(menT, ["head_coach", "headcoach", "coach"]);
  u.coachW = infobox(womenT, ["head_coach", "headcoach", "coach"]);
  const sw = u._swim.find((t) => swimExist[t]);
  if (sw) u.wiki = "https://en.wikipedia.org/wiki/" + encodeURIComponent(swimExist[sw].title.replace(/ /g, "_"));
  delete u._inst;
  delete u._ath;
  delete u._swim;
  for (const k of Object.keys(u)) if (u[k] === "" || u[k] === false) delete u[k];
}
const stats = { total: unis.length, logo: unis.filter((u) => u.logo).length, city: unis.filter((u) => u.city).length, coach: unis.filter((u) => u.coach || u.coachM || u.coachW).length };
console.log("datos:", stats);
console.log("ejemplos:", JSON.stringify(unis.filter((u) => ["Texas", "Kenyon", "Drury", "Florida"].includes(u.n)).slice(0, 4)));
const json = JSON.stringify({ updated: new Date().toISOString().slice(0, 10), source: "Wikipedia (CC BY-SA 4.0)", unis });
await writeFile(process.argv[2] || "web/data/unis.json", json);
if (process.env.DATOS_LOG) {
  const b64 = Buffer.from(json).toString("base64");
  for (let i = 0; i < b64.length; i += 3000) console.log(`@@DATOS ${b64.slice(i, i + 3000)}`);
}
