// Récords: NCAA (División I, II y III, hombres y mujeres) y récords de cada universidad.
// - NCAA: libro de récords oficial de NCAA.org (PDF) y, para D-I y D-II, las cabeceras de las pruebas del último
//   campeonato en HY-TEK ("NCAA: N 14:10.03 3/25/2026 Ahmed Jaouadi, Florida"), que traen los récords al día.
// - Universidades: página "Records" de su web de deportes (HTML o PDF). Solo se guardan los datos (prueba, tiempo,
//   nombre, año), no el texto. SOLO="Drury,Kenyon" prueba con esas universidades y lo imprime sin guardar.
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" };
const SOLO = (process.env.SOLO || "").split(",").map((s) => s.trim()).filter(Boolean);
const readJSON = async (f, d) => { try { return JSON.parse(await readFile(f, "utf8")); } catch { return d; } };
const tmp = await mkdtemp(join(tmpdir(), "rec-"));
let nTmp = 0;

async function get(url, bin = false) {
  try {
    const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(25000) });
    if (!r.ok) return null;
    return { url: r.url, type: r.headers.get("content-type") || "", body: bin ? Buffer.from(await r.arrayBuffer()) : await r.text() };
  } catch { return null; }
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; try { await fn(items[k]); } catch (e) { if (SOLO.length) console.log("error", e.message); } } }));
}
async function pdfText(buf) {
  const f = join(tmp, `d${nTmp++}.pdf`);
  await writeFile(f, buf);
  try { return execFileSync("pdftotext", ["-layout", f, "-"], { maxBuffer: 50e6 }).toString("utf8"); } catch { return ""; }
}
const dec = (s) => s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n").replace(/<\/t[dh]>/gi, "  ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;|&#8217;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;|&#160;/g, " ").replace(/&#8211;|&ndash;|&#8212;|&mdash;/g, "-").replace(/[ \t]+/g, " ");

// "50-YARD FREESTYLE", "100 Yard Free", "200 Medley Relay" → "50 Y Free", "200 Y Medley Relay".
const STROKE = [[/free(style)?\s+relay/i, "Free Relay"], [/medley\s+relay/i, "Medley Relay"], [/free(style)?/i, "Free"], [/back(stroke)?/i, "Back"], [/breast(stroke)?/i, "Breast"], [/(butterfly|\bfly\b)/i, "Fly"], [/(individual medley|\bIM\b)/i, "IM"]];
function evName(s) {
  const d = /\b(25|50|100|200|400|500|800|1,?000|1,?650)\b/.exec(s);
  if (!d) return "";
  if (/diving|meter div|1-?m(eter)?\b|3-?m(eter)?\b/i.test(s)) return "";
  const st = STROKE.find(([re]) => re.test(s));
  if (!st) return "";
  const c = /\b(meter|metre|LCM|SCM)\b/i.test(s) && !/yard/i.test(s) ? "M" : "Y";
  return `${d[1].replace(",", "")} ${c} ${st[1]}`;
}
const TIME = /\b((?:\d{1,2}:)?\d{2}\.\d{2})\b/;
const ORDER = ["50 Y Free", "100 Y Free", "200 Y Free", "500 Y Free", "1000 Y Free", "1650 Y Free", "100 Y Back", "200 Y Back", "100 Y Breast", "200 Y Breast", "100 Y Fly", "200 Y Fly", "100 Y IM", "200 Y IM", "400 Y IM", "200 Y Free Relay", "400 Y Free Relay", "800 Y Free Relay", "200 Y Medley Relay", "400 Y Medley Relay"];
const secs = (t) => { const m = /^(?:(\d+):)?(\d+\.\d+)/.exec(t || ""); return m ? (+m[1] || 0) * 60 + +m[2] : Infinity; };
const okPace = (ev, t) => { const d = +ev.split(" ")[0]; const p = secs(t) / d; return p > (/Relay/.test(ev) ? 0.33 : 0.36) && p < (/Breast/.test(ev) ? 0.95 : 0.85); };

// ---------- NCAA ----------
const ncaa = { D1: { M: {}, W: {} }, D2: { M: {}, W: {} }, D3: { M: {}, W: {} } };
const DIVRE = [["D3", /DIVISION III/], ["D2", /DIVISION II\b/], ["D1", /DIVISION I\b/]];
for (const [g, url] of [["M", "http://fs.ncaa.org/Docs/stats/swimming_rb/MensSwimRecs.pdf"], ["W", "http://fs.ncaa.org/Docs/stats/swimming_rb/WomensSwimRecs.pdf"]]) {
  const r = await get(url, true);
  if (!r) { console.log("sin PDF", url); continue; }
  const text = await pdfText(r.body);
  let div = "", ev = "";
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const dv = DIVRE.find(([, re]) => re.test(line));
    if (dv && /MEN/.test(line)) { div = dv[0]; ev = ""; continue; }
    if (!div) continue;
    if (/^[0-9,]+-YARD [A-Z ]+$/.test(line)) { ev = evName(line); continue; }
    const m = /^((?:\d{1,2}:)?\d{1,2}\.\d{1,2})\s*[—–-]\s*(.+?),\s*(\d{1,2}-\d{1,2}-\d{4})/.exec(line);
    if (ev && m) {
      let rest = m[2], who = "", team = rest;
      const rel = /Relay/.test(ev);
      if (rel) { const p = /^(.*?)\s*\((.*)\)$/.exec(rest); if (p) { team = p[1]; who = p[2]; } }
      else { const i = rest.lastIndexOf(","); if (i > 0) { who = rest.slice(0, i).trim(); team = rest.slice(i + 1).trim(); } }
      const [mo, dd, yy] = m[3].split("-");
      ncaa[div][g][ev] ||= { t: m[1].replace(/\.(\d)$/, ".$10"), n: who, s: team, d: `${yy}-${mo.padStart(2, "0")}-${dd.padStart(2, "0")}`, src: "NCAA.org" };
      ev = "";
    }
  }
}
// Cabeceras del último campeonato (D-I y D-II) en swimmeetresults.tech: récords al día.
const yNow = new Date().getUTCFullYear();
for (const y of [yNow - 1, yNow]) {
  for (const [div, slug, g0] of [["D1", "NCAA-Division-I-Men", "M"], ["D1", "NCAA-Division-I-Women", "W"], ["D2", "NCAA-Division-II", ""]]) {
    const base = `https://swimmeetresults.tech/${slug}-${y}/`;
    const idx = await get(base + "evtindex.htm");
    if (!idx) continue;
    const links = [...new Set([...idx.body.matchAll(/href="([^"]+F\d{3}\.htm)"/gi)].map((m) => m[1]))];
    await pool(links, 6, async (l) => {
      const p = await get(base + l);
      if (!p) return;
      const pre = dec(p.body);
      const title = /Event\s+\d+\s+((?:Women|Men)[^\n]*)/i.exec(pre)?.[1] || "";
      const g = /women/i.test(title) ? "W" : /\bmen\b/i.test(title) ? "M" : g0;
      const ev = evName(title);
      if (!ev || !g) return;
      const m = /^\s*NCAA[^:\n]*:\s*\S?\s*((?:\d{1,2}:)?\d{2}\.\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(.+)$/m.exec(pre);
      if (!m) return;
      const cur = ncaa[div][g][ev];
      if (cur && secs(cur.t) <= secs(m[1])) return;
      let rest = m[5].trim(), who = rest, team = "";
      const rel = /Relay/.test(ev);
      if (rel) { const q = /^(.*?)\s*[-–]?\s*(?:\((.*)\))?$/.exec(rest); team = (q?.[1] || rest).replace(/\s+[A-Z]$/, ""); who = (q?.[2] || "").replace(/\s{2,}/g, " "); }
      else { const i = rest.lastIndexOf(","); if (i > 0) { who = rest.slice(0, i).trim(); team = rest.slice(i + 1).trim(); } }
      ncaa[div][g][ev] = { t: m[1], n: who, s: team, d: `${m[4]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`, src: `${slug}-${y}` };
    });
  }
}
for (const d of Object.keys(ncaa)) for (const g of ["M", "W"]) console.log("NCAA", d, g, Object.keys(ncaa[d][g]).length, "récords");

// ---------- Universidades ----------
const unis = (await readJSON("web/data/unis.json", { unis: [] })).unis;
const cal = await readJSON("web/data/calendario.json", {});
const old = await readJSON("web/data/records.json", {});
const out = {};
// Lee líneas "50 Free   19.88   John Smith   2019" de una tabla o PDF de récords. Se queda con la primera marca de cada prueba.
function parseRecords(text, g0) {
  const rec = { M: {}, W: {} };
  let g = g0, ev = "";
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (/^(men|men's|mens)\b/i.test(line) && line.length < 40) g = "M";
    if (/^(women|women's|womens)\b/i.test(line) && line.length < 40) g = "W";
    const e = evName(line.slice(0, 40));
    const t = TIME.exec(line);
    if (e && !t) { ev = e; continue; }
    const evNow = e || ev;
    if (!evNow || !t || !g) continue;
    const time = t[1];
    if (!okPace(evNow, time) || rec[g][evNow]) { ev = ""; continue; }
    const after = line.slice(line.indexOf(time) + time.length).trim();
    const before = e ? line.slice(0, line.indexOf(time)).replace(/^.*?\b(free(style)?|back(stroke)?|breast(stroke)?|fly|butterfly|im|individual medley|relay)\b/i, "").trim() : line.slice(0, line.indexOf(time)).trim();
    const year = /\b(19[6-9]\d|20[0-2]\d)\b/.exec(line)?.[1] || "";
    const who = (after.replace(/\b(19|20)\d{2}\b.*$/, "") || before).replace(/[,;|-]+$/, "").replace(/\s{2,}/g, " ").trim().slice(0, 120);
    rec[g][evNow] = { t: time, n: who, y: year };
    ev = "";
  }
  return rec;
}
const sportPages = (u) => (cal.src?.[u.n] || []).map((s) => [s.split("|")[0], s.slice(s.indexOf("|") + 1).replace(/\/schedule.*$/, "")]);
const todo = unis.filter((u) => (!SOLO.length || SOLO.includes(u.n)) && sportPages(u).length);
await pool(todo, 6, async (u) => {
  const res = { M: {}, W: {} };
  let src = "";
  for (const [g, sp] of sportPages(u)) {
    const page = await get(sp);
    if (!page) continue;
    const origin = new URL(page.url).origin;
    // Enlaces "Records" del menú del deporte (Sidearm los guarda en JSON y en <a>).
    const cands = new Set();
    for (const m of page.body.matchAll(/"title":"([^"]*Records?[^"]*)"[^{}]*?"url":"([^"]+)"/gi)) if (!/national|ncaa|conference|pool|facility/i.test(m[1])) cands.add(new URL(m[2], origin).href);
    for (const m of page.body.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([^<]{0,60}Records?[^<]{0,30})<\/a>/gi)) if (!/national|ncaa|conference/i.test(m[2])) cands.add(new URL(m[1].replace(/&amp;/g, "&"), origin).href);
    for (const c of [...cands].slice(0, 3)) {
      let r = await get(c, true);
      if (!r) continue;
      let text = "";
      if (/pdf/i.test(r.type) || r.body.slice(0, 4).toString() === "%PDF") text = await pdfText(r.body);
      else {
        const html = r.body.toString("utf8");
        text = dec(html);
        // Página que solo enlaza a otras (PDF o subpáginas de récords del equipo).
        if ((text.match(/\d{1,2}:\d{2}\.\d{2}|\b\d{2}\.\d{2}\b/g) || []).length < 10) {
          const subs = [...html.matchAll(/href="([^"]+)"[^>]*>([^<]{0,80})</gi)].filter(([, h, t]) => /record|top|all-?time/i.test(t + h) && !/national|ncaa|conference|opponent|pool|year.?by|champion|american/i.test(t + h)).map(([, h]) => new URL(h.replace(/&amp;/g, "&"), r.url).href).filter((h) => h.startsWith(origin) || /\.pdf/i.test(h));
          for (const s of [...new Set(subs)].slice(0, 3)) {
            const r2 = await get(s, true);
            if (!r2) continue;
            const t2 = /pdf/i.test(r2.type) || r2.body.slice(0, 4).toString() === "%PDF" ? await pdfText(r2.body) : dec(r2.body.toString("utf8"));
            if ((t2.match(/\d{1,2}:\d{2}\.\d{2}|\b\d{2}\.\d{2}\b/g) || []).length >= 10) { text = t2; r = r2; break; }
          }
        }
      }
      const rec = parseRecords(text, g);
      const n = Object.keys(rec.M).length + Object.keys(rec.W).length;
      if (SOLO.length) console.log(u.n, g, c, "→", r.url, "pruebas:", n);
      if (n >= 6) {
        for (const gg of ["M", "W"]) for (const [e, v] of Object.entries(rec[gg])) res[gg][e] ||= v;
        src ||= r.url;
        break;
      }
    }
  }
  const n = Object.keys(res.M).length + Object.keys(res.W).length;
  if (n >= 6) out[u.n] = { src, M: res.M, W: res.W };
  if (SOLO.length) console.log(u.n, JSON.stringify(out[u.n] || null).slice(0, 1500));
});
if (SOLO.length) { console.log(JSON.stringify(ncaa).slice(0, 3000)); process.exit(0); }
for (const [k, v] of Object.entries(old.u || {})) if (!out[k]) out[k] = v;
await writeFile("web/data/records.json", JSON.stringify({ updated: new Date().toISOString().slice(0, 10), order: ORDER, ncaa, u: out }));
console.log("récords de universidades:", Object.keys(out).length, "de", todo.length);
