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
  const lines = text.split("\n").map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
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
    const who = (after.replace(/\b(19|20)\d{2}\b.*$/, "") || before).replace(/^(relay|team)\s+/i, "").replace(/[,;|-]+$/, "").replace(/\s{2,}/g, " ").trim().slice(0, 120);
    rec[g][evNow] = { t: time, n: who, nb: before.slice(0, 120), nx: (lines[li + 1] || "").slice(0, 80), pv: (lines[li - 1] || "").slice(0, 80), y: year };
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
    for (const c of [...cands].filter((c) => !/\/news\//i.test(c)).slice(0, 3)) {
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
// ---------- Limpieza: solo se guarda lo que tiene sentido ----------
const BADW = /\b(relay|rank|name|time|year|butterfly|freestyle|backstroke|breaststroke|medley|championships?|invitational|invite|ncaa|record|school|team|meet|conference|vs\.?|dual)\b/i;
const PART = /^(de|van|von|da|del|la|le|di|du|st\.?|jr\.?|ii|iii|iv)$/i;
const tcase = (w) => (w === w.toUpperCase() && w.length > 2 ? w[0] + w.slice(1).toLowerCase() : w);
// Saca "Nombre Apellido" de un trozo de texto con fechas, puestos, siglas o la competición pegados.
function pickName(str) {
  const s0 = String(str || "").replace(/[\u200b-\u200d\ufeff]/g, "").replace(/\b\d{1,2}[\/-]\d{1,2}([\/-]\d{0,4})?/g, " ").replace(/\b\d{1,2}-[A-Z][a-z]{2}-\d{2,4}\b/g, " ").replace(/[‘'’]\d{2}\b/g, " ").replace(/\/\d{4}\/\S*/g, " ").replace(/\([^)]*\)?/g, " ").replace(/[*#]+/g, " ").replace(/\.{2,}/g, " ");
  const toks = s0.split(/[\s,;|]+/).filter(Boolean);
  let best = [];
  for (let i = 0; i < toks.length; i++) {
    const run = [];
    for (let j = i; j < toks.length; j++) {
      const w = toks[j].replace(/[.:]+$/, (m) => (/^[A-Z]$/.test(toks[j][0]) && toks[j].length === 2 ? "." : ""));
      const isWord = /^\p{Lu}[\p{L}'’\-]+$/u.test(w) || (/^[A-Z]\.?$/.test(w) && run.length > 0) || (PART.test(w) && run.length > 0) || /^"[\p{L}]+"$/u.test(w);
      if (!isWord || BADW.test(w) || /^(and|at|the|of)$/i.test(w) || /-$/.test(w) || /^[A-Z]{2,3}$/.test(w) || /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\.?$/i.test(w)) break;
      // Siglas de equipo o conferencia ("WAC", "NSIC") cortan el nombre, salvo que todo esté en mayúsculas.
      if (run.length >= 2 && /^[A-Z]{2,5}$/.test(w) && !run.every((x) => x === x.toUpperCase())) break;
      run.push(w);
    }
    if (run.length >= 2 && run.length <= 4) { best = run; break; }
  }
  return best.length ? best.map(tcase).join(" ") : "";
}
const yy = new Date().getUTCFullYear() % 100;
function tidyRec(ev, r) {
  const rel = /Relay/.test(ev);
  const raw = String(r.n || "");
  let y = r.y || "";
  const dm = /\b\d{1,2}\/\d{1,2}\/(\d{4}|\d{2})\b/.exec(raw + " " + (r.nb || ""));
  if (!y && dm) y = dm[1].length === 4 ? dm[1] : String(+dm[1] <= yy ? 2000 + +dm[1] : 1900 + +dm[1]);
  if (!/^(19[5-9]\d|20[0-3]\d)$/.test(y)) y = "";
  let n = "";
  if (rel) {
    const parts = raw.replace(/^(relay|team)\s+/i, "").split(/\s*[,/&]\s*|\s+-\s+/).map(pickName);
    n = parts.length >= 2 && parts.every(Boolean) ? parts.join(", ") : "";
  } else {
    // El nombre puede estar en la misma línea, o justo debajo o encima (tablas de dos líneas), si esa línea no es otra marca.
    const near = (x) => (x && !/(\d{1,2}:)?\d{1,2}\.\d{2}/.test(x) ? pickName(x) : "");
    n = pickName(raw) || pickName(r.nb) || near(r.nx) || near(r.pv);
    if (!n) return null;
  }
  return { t: r.t.replace(/^0:/, ""), n, y };
}
// Mejores marcas de los nadadores de cada universidad en los resultados guardados (esta temporada y la anterior):
// sirven para comprobar que la tabla leída es de verdad la de récords y del sexo correcto.
const bests = {};
{
  const sw = (await readJSON("web/data/nadadores.json", {})).swimmers || [];
  const al = (await readJSON("web/data/alias-equipos.json", {})).a || {};
  const byName = new Map();
  for (const u of unis) for (const k of [u.n, u.full]) if (k) byName.set(k.toLowerCase(), u.n);
  for (const x of sw) {
    if (!x.g || !x.b) continue;
    const t = String(x.t || ""), t2 = t.replace(/-[A-Z]{2}$/, "");
    const uni = al[t] || al[t2] || byName.get(t.toLowerCase()) || byName.get(t2.toLowerCase());
    if (!uni) continue;
    const b = ((bests[uni] ||= { M: {}, W: {} })[x.g] ||= {});
    const dv = { D2: "D2", D3: "D3" }[unis.find((u) => u.n === uni)?.div];
    for (const [ev, v] of Object.entries(x.b)) { const sc = secs(v[0]); if (ORDER.includes(ev) && okPace(ev, v[0]) && sc >= secs(ncaa.D1[x.g]?.[ev]?.t) - 0.01 && !(dv && sc < secs(ncaa[dv]?.[x.g]?.[ev]?.t) * 0.99) && sc < (b[ev] ?? Infinity)) b[ev] = sc; }
  }
}
// Cuántas pruebas tienen a algún nadador actual claramente más rápido que el "récord".
const beaten = (uni, g, set) => Object.entries(set).filter(([ev, r]) => !/Relay/.test(ev) && (bests[uni]?.[g]?.[ev] ?? Infinity) < secs(r.t) - 0.25).length;
// Sexo de una tabla por cómo de cerca están sus tiempos del récord NCAA masculino (mediana del cociente).
const ratioM = (set) => { const q = Object.entries(set).filter(([ev]) => !/Relay/.test(ev) && ncaa.D1.M[ev]).map(([ev, r]) => secs(r.t) / secs(ncaa.D1.M[ev].t)).sort((a, b) => a - b); return q.length >= 4 ? q[q.length >> 1] : 0; };
const divOf = Object.fromEntries(unis.map((u) => [u.n, u.div]));
const nickOf = Object.fromEntries(unis.map((u) => [u.n, (u.nick || "").toLowerCase()]));
function cleanUni(x0, name) {
  // Primero, ¿cada tabla es del sexo que dice? Una tabla de chicas leída como de chicos (o al revés) se cambia o se quita.
  const x = { src: x0.src, M: { ...(x0.M || {}) }, W: { ...(x0.W || {}) } };
  for (const g of ["M", "W"]) {
    const o = g === "M" ? "W" : "M";
    const set = x[g];
    if (!Object.keys(set).length) continue;
    const r = ratioM(set);
    const looks = r ? (r < 1.115 ? "M" : r > 1.19 ? "W" : "") : "";
    const wrong = looks === o || (beaten(name, g, set) >= 3 && beaten(name, o, set) <= 1 && looks !== g);
    if (wrong) { if (!Object.keys(x[o]).length || JSON.stringify(x[o]) === JSON.stringify(set)) x[o] = set; x[g] = {}; }
  }
  if (JSON.stringify(x.M) === JSON.stringify(x.W)) x.W = {};
  const res = { src: x.src, M: {}, W: {} };
  const dv = { D2: "D2", D3: "D3" }[divOf[name]];
  for (const g of ["M", "W"]) {
    const ent = Object.entries(x[g] || {}).filter(([ev]) => ORDER.includes(ev));
    let bad = 0;
    for (const [ev, r] of ent) {
      const top = ncaa.D1[g][ev];
      const sec = secs(r.t);
      // Más rápido que el récord NCAA de la División I es imposible; mucho más lento, prueba mal leída.
      if (top && (sec < secs(top.t) - 0.005 || sec > secs(top.t) * 1.4)) { bad++; continue; }
      // Tampoco puede batir el récord de su propia división por mucho (se lee mal o es del otro sexo).
      const own = dv && ncaa[dv]?.[g]?.[ev];
      if (own && sec < secs(own.t) * 0.99) { bad++; continue; }
      const c = tidyRec(ev, r);
      // El apodo del equipo ("Big Red") o el nombre de la universidad no son un nadador.
      const low = (c?.n || "").toLowerCase();
      if (c && low && (low === nickOf[name] || name.toLowerCase().includes(low) || (nickOf[name] && low.includes(nickOf[name])))) c.n = "";
      if (c && (c.n || /Relay/.test(ev))) res[g][ev] = c; else bad++;
    }
    // Si fallan muchos, la tabla entera está mal leída (o es la del otro sexo).
    if (ent.length && bad / ent.length > 0.3) res[g] = {};
    // Si varios nadadores actuales ya son más rápidos, no es la tabla de récords (o está muy vieja).
    if (beaten(name, g, res[g]) >= 3) res[g] = {};
    // Un récord concreto superado por un nadador actual: no se enseña un dato viejo.
    for (const [ev, r] of Object.entries(res[g])) if (!/Relay/.test(ev) && (bests[name]?.[g]?.[ev] ?? Infinity) < secs(r.t) - 0.25) delete res[g][ev];
    // Pocas pruebas individuales con nombre: tabla incompleta, mejor no enseñarla.
    if (Object.keys(res[g]).filter((ev) => !/Relay/.test(ev)).length < 8) res[g] = {};
  }
  const n = Object.keys(res.M).length + Object.keys(res.W).length;
  return n >= 6 ? res : null;
}
if (SOLO.length) { for (const k of Object.keys(out)) console.log(k, JSON.stringify(cleanUni(out[k], k)).slice(0, 1200)); console.log(JSON.stringify(ncaa).slice(0, 3000)); process.exit(0); }
for (const [k, v] of Object.entries(old.u || {})) if (!out[k]) out[k] = v;
for (const k of Object.keys(out)) { const c = cleanUni(out[k], k); if (c) out[k] = c; else delete out[k]; }
// ---------- Fotos de los nadadores con récord ----------
// Solo fotos claramente suyas: de la plantilla de su universidad (este año o anteriores) con el mismo nombre,
// o de Wikipedia cuando la página dice que es nadador.
{
  const pl = (await readJSON("web/data/plantillas.json", {})).plant || {};
  const fp = (await readJSON("web/data/fotos-pasadas.json", {})).u || {};
  const fx = (await readJSON("web/data/fotos-extra.json", {})).f || {};
  const low = (n) => n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
  const roster = (uni) => {
    const m = new Map();
    for (const l of Object.values(pl[uni] || {})) for (const e of l) if (Array.isArray(e) && e[1]) m.set(low(e[0]), e[1]);
    for (const [n, img] of Object.entries(fp[uni] || {})) if (img && !m.has(low(n))) m.set(low(n), img);
    return m;
  };
  const uniOfSchool = (sch) => { const k = low(sch.replace(/\(.*?\)/g, "").replace(/\bSt\.?$/, "State")); return unis.find((u) => low(u.n) === k || low(u.full || "") === k || low(u.n.replace(/\(.*?\)/g, "")) === k)?.n; };
  let found = 0, wiki = 0;
  const wikiImg = async (n) => {
    for (const t of [n, n + " (swimmer)"]) {
      const r = await get("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(t.replace(/ /g, "_")));
      if (!r) continue;
      try { const j = JSON.parse(r.body); if (/swimmer/i.test((j.description || "") + " " + (j.extract || "").slice(0, 200)) && j.thumbnail?.source) return j.thumbnail.source; } catch {}
    }
    return "";
  };
  const ncaaList = [];
  for (const d of Object.values(ncaa)) for (const g of Object.values(d)) for (const [ev, r] of Object.entries(g)) if (!/Relay/.test(ev) && r.n) ncaaList.push(r);
  await pool(ncaaList, 4, async (r) => {
    const uni = r.s && uniOfSchool(r.s);
    const img = (uni && roster(uni).get(low(r.n))) || fx[low(r.n)] || (await wikiImg(r.n));
    if (img) { r.i = img; found++; if (/wiki/.test(img)) wiki++; }
  });
  for (const [uni, x] of Object.entries(out)) {
    const m = roster(uni);
    for (const g of ["M", "W"]) for (const [ev, r] of Object.entries(x[g])) if (!/Relay/.test(ev) && r.n) { const img = m.get(low(r.n)); if (img) { r.i = img; found++; } }
  }
  console.log("fotos de nadadores con récord:", found, "· de Wikipedia:", wiki);
}
await writeFile("web/data/records.json", JSON.stringify({ updated: new Date().toISOString().slice(0, 10), order: ORDER, ncaa, u: out }));
console.log("récords de universidades:", Object.keys(out).length, "de", todo.length);
