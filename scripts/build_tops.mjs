// Mejores tiempos del país por prueba (web/data/tops-Y.json y tops-M.json), sacados de todas las competiciones guardadas
// (web/data/m/*.json) de esta temporada y de la anterior. Un tiempo por nadador (o por relevo de cada universidad) y prueba.
// También guarda las marcas mínimas oficiales de NCAA D2, D3 y NAIA (de sus PDF de 2026-27) para compararlas en la app.
import { readFile, writeFile } from "node:fs/promises";
const J = async (f, def = {}) => JSON.parse(await readFile("web/data/" + f, "utf8").catch(() => JSON.stringify(def)));
const enc = await J("encuentros.json", { meets: [] });
const unis = (await J("unis.json", { unis: [] })).unis || [];
const alias = (await J("alias-equipos.json", { a: {} })).a || {};
const RECS = (await J("records.json"))?.ncaa || {};
const REC = RECS.D1 || { M: {}, W: {} };

const secs = (t) => { const m = /^(?:(\d+):)?(\d+\.\d+)$/.exec(String(t || "").replace(/^[xX*]/, "").replace(/[A-Za-z#$&*@!^]+$/, "")); return m ? (+m[1] || 0) * 60 + +m[2] : Infinity; };
const fmt = (s) => { const m = Math.floor(s / 60), r = (s - m * 60).toFixed(2); return m ? `${m}:${r.padStart(5, "0")}` : r; };
const low = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
// "Graham, Rian W" → "Rian Graham" (sin la inicial del segundo nombre, que unas hojas ponen y otras no).
const fixN = (n) => (n.includes(",") ? n.split(",").map((x) => x.trim()).filter(Boolean).reverse().join(" ") : n).replace(/([a-z])(FR|SO|JR|SR|GR)\b/g, "$1").replace(/\s+(FR|SO|JR|SR|GR|5Y)$/, "").replace(/\s+[A-Z]\.?(?=\s|$)/g, "").replace(/\s+/g, " ").trim();
const cleanTeam = (t) => String(t || "").replace(/[\s(]*[xX*]?(\d{1,2}:)?\d{1,2}\.\d{2}\b.*$/, "").replace(/^\d{2}-\d{2}\s+/, "").replace(/\s*\((W|M|Men|Women)\)$/i, "").replace(/\s*\([^)]*$/, "").trim();
const tk = (t) => low(t).replace(/^(the )?university of /, "").replace(/, university of,?/, "").replace(/\bsaint\b/g, "st").replace(/\bmount\b/g, "mt").replace(/\bst\.?$/, "state").replace(/\b(university|college|swimming|swim|diving|team|athletics|aquatics|club|of|the)\b/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// Universidad de un equipo: alias de plantillas, nombre exacto o nombre limpio; si no, una de las universidades del encuentro.
const byKey = new Map();
for (const u of unis) for (const k of [u.n, u.full].filter(Boolean)) { const key = tk(k); if (key && !byKey.has(key)) byKey.set(key, u); }
const byN = new Map(unis.map((u) => [u.n, u]));
function uniOf(team, meetUnis) {
  const t = cleanTeam(team), t2 = t.replace(/-[A-Z]{1,3}$/, "").trim();
  const a = alias[t] || alias[t2] || alias[team];
  if (a && byN.has(a)) return byN.get(a);
  const k = tk(t2);
  if (byKey.has(k)) return byKey.get(k);
  const cand = (meetUnis || []).map((n) => byN.get(n)).filter(Boolean).filter((u) => { const a = tk(u.n), b = tk(u.full || ""); return k && (a === k || b === k || (k.length >= 4 && (a.startsWith(k) || b.includes(k)))); });
  return cand.length === 1 ? cand[0] : null;
}

// Solo las pruebas oficiales (yardas como en la NCAA; metros como en piscina corta y larga).
const EV_Y = new Set(["50 Y Free", "100 Y Free", "200 Y Free", "500 Y Free", "1000 Y Free", "1650 Y Free", "100 Y Back", "200 Y Back", "100 Y Breast", "200 Y Breast", "100 Y Fly", "200 Y Fly", "200 Y IM", "400 Y IM", "200 Y Free Relay", "400 Y Free Relay", "800 Y Free Relay", "200 Y Medley Relay", "400 Y Medley Relay"]);
const EV_M = new Set(["50 M Free", "100 M Free", "200 M Free", "400 M Free", "800 M Free", "1500 M Free", "50 M Back", "100 M Back", "200 M Back", "50 M Breast", "100 M Breast", "200 M Breast", "50 M Fly", "100 M Fly", "200 M Fly", "100 M IM", "200 M IM", "400 M IM", "200 M Free Relay", "400 M Free Relay", "800 M Free Relay", "200 M Medley Relay", "400 M Medley Relay"]);
// "Women 100 Yard Freestyle" → ["W", "100 Y Free", "S"|"L"|""]; relevos: "200 Y Free Relay".
function evInfo(title) {
  const g = /^(Women|Girls)\b/i.test(title) ? "W" : /^(Men|Boys)\b/i.test(title) ? "M" : "";
  if (!g || /diving|dive|\bboard\b|time trial|swim-?off|exhibition/i.test(title)) return null;
  const c = /\byard/i.test(title) ? "Y" : /\bmeter|\bmetre/i.test(title) ? "M" : "";
  if (!c) return null;
  const pool = c === "M" ? (/\bLC\b|long course/i.test(title) ? "L" : /\bSC\b|short course/i.test(title) ? "S" : "") : "";
  const d = /(\d{2,4})\s+(Yard|Meter|Metre)/i.exec(title)?.[1];
  const relay = /relay/i.test(title);
  const st = relay ? (/medley/i.test(title) ? "Medley Relay" : /free/i.test(title) ? "Free Relay" : "") : /individual medley|\bIM\b/i.test(title) ? "IM" : /free/i.test(title) ? "Free" : /back/i.test(title) ? "Back" : /breast/i.test(title) ? "Breast" : /butterfly|\bfly\b/i.test(title) ? "Fly" : "";
  if (!d || !st) return null;
  const ev = `${d} ${c} ${st}`;
  if (!(c === "Y" ? EV_Y : EV_M).has(ev)) return null;
  return [g, ev, pool, relay];
}
// Ritmo posible (como en split_nadadores): ni más rápido que el récord NCAA D1 ni absurdamente lento.
function okTime(ev, s, g, relay, div) {
  const em = /^(\d+) ([YM]) (\S+)/.exec(ev);
  const pc = s / +em[1], cap = ({ Free: 0.9, Back: 1.0, Fly: 1.0, Breast: 1.1, IM: 1.0 }[em[3]] || 1.0) * (em[2] === "M" ? 1.12 : 1);
  if (!(pc >= (relay ? 0.38 : 0.36) && pc <= cap)) return false;
  const top = em[2] === "Y" ? REC[g]?.[ev] : null;
  if (top && s < secs(top.t) - 0.01) return false;
  // D2, D3 y NAIA: tampoco mucho más rápido que el récord de su división (NAIA se compara con el de D2).
  const dr = em[2] === "Y" && div !== "D1" ? RECS[div === "NAIA" ? "D2" : div]?.[g]?.[ev] : null;
  return !dr || s >= secs(dr.t) * 0.99;
}

const now = new Date();
const y0 = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const seasons = [`${y0}-${String(y0 + 1).slice(2)}`, `${y0 - 1}-${String(y0).slice(2)}`];
const nad = await J("nadadores.json", { swimmers: [] });
const arch = new Map(((await J("archivo.json", { meets: [] })).meets || []).map((m) => [m.url.split("#")[0] + "|" + m.name, m]));
const normUrl = (u) => u.split("#")[0].replace("//www.", "//");
const seasonOf = (d) => { const y = +d.slice(0, 4), m = +d.slice(5, 7); const a = m >= 8 ? y : y - 1; return `${a}-${String(a + 1).slice(2)}`; };
let hy = 0;
const skipped = [];
const KEEP = 100, PER_DIV = 25;
const out = { Y: {}, M: {} };
let read = 0, rows = 0, noUni = 0, badSeed = 0;
for (const [si, season] of seasons.entries()) {
  const best = new Map(); // "g|ev" → Map(persona → fila)
  for (const m of enc.meets) {
    if (m.s !== season) continue;
    const d = await J("m/" + m.id.slice(2) + ".json", null).catch(() => null) || await J("m/" + m.id + ".json", null).catch(() => null);
    if (!d?.ev) continue;
    // Hoja mal leída (pruebas y tiempos que no casan, p. ej. "Women 100 Breast" con 1:06 y 54.21 mezclados con otras
    // pruebas): si más de 1 de cada 5 tiempos no tiene un ritmo posible para su prueba, la competición entera no cuenta.
    {
      let n = 0, bad = 0;
      for (const e of d.ev) { const info = evInfo(e.ti || ""); if (!info) continue; for (const r of e.res || []) { const s = secs(r[4]); if (s === Infinity) continue; n++; if (!okTime(info[1], s, info[0], info[3], "D1")) bad++; } }
      if (d.q || (n >= 20 && bad / n > 0.2)) { skipped.push(`${m.n} (${m.d}, ${Math.round((bad / n) * 100)}% raros)`); continue; }
    }
    read++;
    for (const e of d.ev) {
      const info = evInfo(e.ti || "");
      if (!info) continue;
      const [g, ev, pool, relay] = info;
      const key = g + "|" + ev;
      if (!best.has(key)) best.set(key, new Map());
      const mp = best.get(key);
      for (const r of e.res || []) {
        const [p, n, t, yr, tm, , , l, sw] = r;
        const s = secs(tm);
        if (s === Infinity || /^(DQ|NS|DNS|DFS|SCR)/i.test(String(p))) continue;
        // Un tiempo final mucho mejor que el de inscripción o eliminatoria suele ser una columna mal leída.
        const pvS = secs(r[5]);
        if (pvS < Infinity && s < pvS * 0.93) { badSeed++; continue; }
        const u = uniOf(t, m.u);
        if (!u) { noUni++; continue; }
        if (!okTime(ev, s, g, relay, u.div)) continue;
        const who = relay ? u.n + "|" + (l || "A") : low(fixN(n || "")).replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim() + "|" + u.n;
        if (!relay && who.split(" ").length < 2) continue;
        const prev = mp.get(relay ? u.n : who);
        if (prev && prev.s <= s) continue;
        rows++;
        mp.set(relay ? u.n : who, { s, row: [relay ? (sw || []).slice(0, 4).map(fixN).join(" · ") : fixN(n), u.n, relay ? (l || "") : yr || "", fmt(s), m.id, m.d || "", pool] });
      }
    }
  }
  // Competiciones en directo HY-TEK (no se guardan enteras): sus mejores marcas individuales vienen de nadadores.json.
  for (const sw of nad.swimmers || []) {
    if (sw.g !== "M" && sw.g !== "W") continue;
    for (const [ev, v] of Object.entries(sw.b || {})) {
      if (!/^https?:/.test(v[2] || "") || !(ev.split(" ")[1] === "Y" ? EV_Y : EV_M).has(ev)) continue;
      const am = arch.get(v[2].split("#")[0] + "|" + v[1]);
      if (!am?.start || seasonOf(am.start) !== season) continue;
      const s = secs(v[0]);
      const u = uniOf(sw.t, []);
      if (s === Infinity || !u || !okTime(ev, s, sw.g, false, u.div)) continue;
      const key = sw.g + "|" + ev;
      if (!best.has(key)) best.set(key, new Map());
      const who = low(fixN(sw.n)).replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim() + "|" + u.n;
      const prev = best.get(key).get(who);
      if (prev && prev.s <= s) continue;
      hy++;
      best.get(key).set(who, { s, row: [fixN(sw.n), u.n, sw.y || "", fmt(s), normUrl(v[2]), am.start, ""] });
    }
  }
  for (const [key, mp] of best) {
    const all = [...mp.values()].sort((a, b) => a.s - b.s);
    if (all.length < 3) continue;
    const keep = new Set(all.slice(0, KEEP));
    // Que cada división tenga su propia lista aunque sus tiempos no lleguen al top del país.
    const divOf = (x) => byN.get(x.row[1])?.div || "";
    for (const dv of ["D1", "D2", "D3", "NAIA"]) all.filter((x) => divOf(x) === dv).slice(0, PER_DIV).forEach((x) => keep.add(x));
    const c = key.split("|")[1].split(" ")[1];
    (out[c][key] ||= [[], []])[si] = all.filter((x) => keep.has(x)).map((x) => x.row);
  }
}

// Marcas mínimas oficiales 2026-27 (yardas). [A o automática, B o provisional]. Fuente: PDF de NCAA y NAIA.
const CUTS = {
  D2: {
    src: "https://ncaaorg.s3.amazonaws.com/championships/sports/swimdive/d2/2026-27D2MSW_QualStandards.pdf",
    M: { "50 Y Free": ["19.39", "20.36"], "100 Y Free": ["42.87", "45.01"], "200 Y Free": ["1:34.19", "1:38.90"], "500 Y Free": ["4:19.37", "4:32.34"], "1000 Y Free": ["8:57.17", "9:24.03"], "1650 Y Free": ["15:08.94", "15:54.38"], "100 Y Back": ["46.29", "48.60"], "200 Y Back": ["1:42.18", "1:47.29"], "100 Y Breast": ["52.46", "55.08"], "200 Y Breast": ["1:54.78", "2:00.52"], "100 Y Fly": ["46.17", "48.48"], "200 Y Fly": ["1:44.50", "1:49.72"], "200 Y IM": ["1:44.31", "1:49.53"], "400 Y IM": ["3:46.91", "3:58.26"], "200 Y Free Relay": ["", "1:19.88"], "400 Y Free Relay": ["", "2:56.13"], "800 Y Free Relay": ["", "6:32.68"], "200 Y Medley Relay": ["", "1:27.34"], "400 Y Medley Relay": ["", "3:12.45"] },
    W: { "50 Y Free": ["22.48", "23.60"], "100 Y Free": ["49.44", "51.91"], "200 Y Free": ["1:46.99", "1:52.34"], "500 Y Free": ["4:49.28", "5:03.74"], "1000 Y Free": ["9:52.78", "10:22.42"], "1650 Y Free": ["16:31.17", "17:20.73"], "100 Y Back": ["53.49", "56.16"], "200 Y Back": ["1:57.00", "2:02.85"], "100 Y Breast": ["1:01.03", "1:04.08"], "200 Y Breast": ["2:12.90", "2:19.54"], "100 Y Fly": ["53.37", "56.04"], "200 Y Fly": ["1:58.81", "2:04.75"], "200 Y IM": ["1:59.39", "2:05.36"], "400 Y IM": ["4:16.33", "4:29.14"], "200 Y Free Relay": ["", "1:33.14"], "400 Y Free Relay": ["", "3:24.22"], "800 Y Free Relay": ["", "7:26.89"], "200 Y Medley Relay": ["", "1:42.09"], "400 Y Medley Relay": ["", "3:44.78"] },
  },
  D3: {
    src: "https://ncaaorg.s3.amazonaws.com/championships/sports/swimdive/d3/2026-27D3XSW_QualifyingStandards.pdf",
    M: { "50 Y Free": ["19.54", "20.33"], "100 Y Free": ["42.94", "44.81"], "200 Y Free": ["1:34.86", "1:38.99"], "500 Y Free": ["4:22.02", "4:31.03"], "1650 Y Free": ["15:13.27", "15:50.88"], "100 Y Back": ["46.60", "49.19"], "200 Y Back": ["1:43.27", "1:48.48"], "100 Y Breast": ["52.09", "54.98"], "200 Y Breast": ["1:55.12", "2:00.83"], "100 Y Fly": ["46.03", "48.48"], "200 Y Fly": ["1:43.18", "1:49.36"], "200 Y IM": ["1:44.53", "1:49.88"], "400 Y IM": ["3:49.48", "3:58.49"], "200 Y Free Relay": ["", "1:21.10"], "400 Y Free Relay": ["", "3:00.23"], "800 Y Free Relay": ["", "6:38.55"], "200 Y Medley Relay": ["", "1:29.14"], "400 Y Medley Relay": ["", "3:17.11"] },
    W: { "50 Y Free": ["22.35", "23.50"], "100 Y Free": ["48.62", "51.24"], "200 Y Free": ["1:45.61", "1:51.92"], "500 Y Free": ["4:46.79", "4:59.91"], "1650 Y Free": ["16:29.85", "17:21.20"], "100 Y Back": ["53.70", "56.48"], "200 Y Back": ["1:56.89", "2:03.17"], "100 Y Breast": ["1:00.01", "1:04.12"], "200 Y Breast": ["2:11.54", "2:20.09"], "100 Y Fly": ["53.67", "55.79"], "200 Y Fly": ["1:58.24", "2:04.53"], "200 Y IM": ["1:59.54", "2:05.61"], "400 Y IM": ["4:15.84", "4:28.70"], "200 Y Free Relay": ["", "1:34.80"], "400 Y Free Relay": ["", "3:29.09"], "800 Y Free Relay": ["", "7:36.78"], "200 Y Medley Relay": ["", "1:44.12"], "400 Y Medley Relay": ["", "3:49.44"] },
  },
  NAIA: {
    src: "https://www.naia.org/wp-content/uploads/2026/05/2026-27-Qualifying-Standards-w-Relays.pdf",
    M: { "50 Y Free": ["19.91", "21.55"], "100 Y Free": ["43.96", "47.59"], "200 Y Free": ["1:37.04", "1:45.05"], "500 Y Free": ["4:29.27", "4:51.48"], "1650 Y Free": ["15:47.99", "17:06.20"], "100 Y Back": ["48.23", "52.21"], "200 Y Back": ["1:46.67", "1:55.47"], "100 Y Breast": ["54.28", "58.76"], "200 Y Breast": ["1:59.28", "2:09.12"], "100 Y Fly": ["48.00", "51.96"], "200 Y Fly": ["1:47.83", "1:56.73"], "200 Y IM": ["1:48.32", "1:57.26"], "400 Y IM": ["3:55.30", "4:14.71"], "200 Y Free Relay": ["1:25.94", ""], "400 Y Free Relay": ["3:05.89", ""], "800 Y Free Relay": ["6:52.22", ""], "200 Y Medley Relay": ["1:33.23", ""], "400 Y Medley Relay": ["3:24.71", ""] },
    W: { "50 Y Free": ["23.56", "25.50"], "100 Y Free": ["51.10", "55.32"], "200 Y Free": ["1:51.75", "2:00.97"], "500 Y Free": ["5:02.09", "5:27.01"], "1650 Y Free": ["17:24.02", "18:50.15"], "100 Y Back": ["55.75", "1:00.35"], "200 Y Back": ["2:01.93", "2:11.99"], "100 Y Breast": ["1:02.26", "1:07.40"], "200 Y Breast": ["2:16.00", "2:27.22"], "100 Y Fly": ["55.61", "1:00.20"], "200 Y Fly": ["2:05.30", "2:15.64"], "200 Y IM": ["2:04.32", "2:14.58"], "400 Y IM": ["4:27.32", "4:49.37"], "200 Y Free Relay": ["1:37.95", ""], "400 Y Free Relay": ["3:33.44", ""], "800 Y Free Relay": ["7:52.52", ""], "200 Y Medley Relay": ["1:48.25", ""], "400 Y Medley Relay": ["3:56.91", ""] },
  },
};

const updated = now.toISOString().slice(0, 10);
// Un archivo por piscina y temporada (0 = esta, 1 = la anterior): la app solo baja el que se mira.
for (const c of ["Y", "M"]) for (const si of [0, 1]) {
  const ev = Object.fromEntries(Object.entries(out[c]).map(([k, v]) => [k, v[si] || []]).filter(([, v]) => v.length));
  await writeFile(`web/data/tops-${c}${si}.json`, JSON.stringify({ updated, season: seasons[si], ev }));
}
await writeFile("web/data/cortes.json", JSON.stringify({ updated, season: seasons[0], cuts: CUTS }));
if (skipped.length) console.log("competiciones mal leídas, no cuentan:", skipped.length, "·", skipped.slice(0, 15).join(" · "));
console.log(`mejores tiempos: ${read} competiciones leídas, ${Object.keys(out.Y).length} pruebas en yardas, ${Object.keys(out.M).length} en metros, ${rows} marcas (${hy} de resultados en directo), ${noUni} filas sin universidad, ${badSeed} tiempos descartados por no cuadrar con su inscripción`);
