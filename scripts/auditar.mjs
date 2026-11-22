// Auditoría automática de los datos antes de guardarlos (va en temporada.yml, antes de split_nadadores).
// Corrige sola lo que es seguro (marcas imposibles, yardas puestas como metros, tiempos mal escritos)
// y apunta el resto en web/data/auditoria.json con un historial de 30 días para ver si mejora o empeora.
import { readFile, writeFile, appendFile, readdir } from "node:fs/promises";

const J = async (f, d) => { try { return JSON.parse(await readFile("web/data/" + f, "utf8")); } catch { return d; } };
const secs = (t) => { const m = /^(?:(\d+):)?(\d{1,2}(?:\.\d{1,2})?)$/.exec(String(t || "").trim()); return m ? (+m[1] || 0) * 60 + +m[2] : Infinity; };
const FMT = /^(\d{1,2}:)?\d{1,2}\.\d{2}$/;
const today = new Date().toISOString().slice(0, 10);
const days = (d) => (d ? Math.round((Date.parse(today) - Date.parse(d)) / 864e5) : 999);
const plain = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const nad = await J("nadadores.json", null);
const rec = await J("records.json", { ncaa: {}, u: {} });
const enc = await J("encuentros.json", { meets: [] });
const enl = await J("enlaces.json", { bad: {} });
const D1 = rec.ncaa?.D1 || { M: {}, W: {} };
const report = { updated: today, fixed: {}, warn: {}, ex: {} };
const fix = (k, ex) => { report.fixed[k] = (report.fixed[k] || 0) + 1; if (ex && (report.ex[k] ||= []).length < 8) report.ex[k].push(ex); };
const warn = (k, ex) => { report.warn[k] = (report.warn[k] || 0) + 1; if (ex && (report.ex[k] ||= []).length < 8) report.ex[k].push(ex); };

// Récord D-I en yardas de la misma prueba: tope para yardas, y referencia para detectar yardas puestas como metros.
const yardTop = (ev, g) => D1[g]?.[ev.replace(/ M /, " Y ")]?.t || D1.M?.[ev.replace(/ M /, " Y ")]?.t;
// En metros nadie baja del récord en yardas multiplicado por 1,10 (el récord del mundo en piscina corta va a 1,12).
const METERS = { 50: 1.08, 100: 1.1, 200: 1.1, 400: 1.0, 800: 1.0, 1500: 1.0 };

const DESPUES = process.argv[2] === "despues";
// Nombre de pila → sexo, contado en todos los nadadores (Madison, Michael...). Solo nombres muy claros.
const firstOf = (n) => (plain(String(n).includes(",") ? String(n).split(",").slice(1).join(" ") : n).match(/[a-z]+/) || [""])[0];
const fnSex = new Map();
if (nad) {
  const c = new Map();
  for (const s of nad.swimmers) if (s.g === "M" || s.g === "W") { const f = firstOf(s.n); if (f.length < 3) continue; const x = c.get(f) || { M: 0, W: 0 }; x[s.g]++; c.set(f, x); }
  for (const [f, x] of c) { const t = x.M + x.W; if (t >= 30 && Math.max(x.M, x.W) >= 0.88 * t) fnSex.set(f, x.M > x.W ? "M" : "W"); }
}

if (nad && !DESPUES) {
  for (const s of nad.swimmers) {
    const fs = fnSex.get(firstOf(s.n));
    if (fs && s.g && s.g !== fs) { fix("sexo corregido por el nombre", `${s.n} (${s.t}) ${s.g}→${fs}`); s.g = fs; }
    for (const [ev, v] of Object.entries(s.b || {})) {
      let t = String(v?.[0] || "").trim();
      // "X1:03.74" (exhibición) o "351.83" (3:51.83 sin los dos puntos): se arregla el formato.
      const t2 = t.replace(/^[xX*]+/, "").replace(/^(\d{1,2})(\d{2}\.\d{2})$/, (m, a, b) => (+a >= 1 ? `${a}:${b}` : m));
      if (t2 !== t && FMT.test(t2)) { v[0] = t = t2; fix("formato del tiempo arreglado", `${s.n} · ${ev} · ${t}`); }
      if (!FMT.test(t) || +t.split(":").pop() >= 60) { delete s.b[ev]; fix("tiempo mal escrito", `${s.n} · ${ev} · ${t}`); continue; }
      const m = /^(\d+) ([YM]) /.exec(ev);
      if (!m) continue;
      // Demasiado lento para un universitario (suele ser el tiempo de otra prueba mal leída, p. ej. un 50 libre en 59.58).
      const st = /(\w+)$/.exec(ev)[1], cap = ({ Free: 0.9, Back: 1.0, Fly: 1.0, Breast: 1.1, IM: 1.0 }[st] || 1.1) * (m[2] === "M" ? 1.12 : 1);
      if (secs(t) / +m[1] > cap) { delete s.b[ev]; fix("demasiado lento para esa prueba", `${s.n} · ${ev} · ${t}`); continue; }
      const top = yardTop(ev, s.g === "W" ? "W" : "M");
      if (!top) continue;
      if (m[2] === "Y" && secs(t) < secs(top) - 0.01) { delete s.b[ev]; fix("más rápido que el récord NCAA", `${s.n} · ${ev} · ${t}`); }
      else if (m[2] === "M" && METERS[m[1]] && secs(t) < secs(top) * METERS[m[1]]) { delete s.b[ev]; fix("yardas puestas como metros", `${s.n} · ${ev} · ${t}`); }
    }
  }
  // Récords de universidad más lentos que una marca de un nadador suyo: o hay récord nuevo o la marca está mal.
  const best = new Map();
  for (const s of nad.swimmers) for (const [ev, v] of Object.entries(s.b || {})) { const k = plain(s.t) + "|" + s.g + "|" + ev; const b = best.get(k); if (!b || secs(v[0]) < secs(b[0])) best.set(k, [v[0], s.n]); }
  for (const [uni, r] of Object.entries(rec.u || {})) for (const g of ["M", "W"]) for (const [ev, x] of Object.entries(r[g] || {})) {
    if (!FMT.test(String(x?.t || ""))) { warn("récord mal escrito", `${uni} · ${ev} · ${x?.t}`); continue; }
    const b = best.get(plain(uni) + "|" + g + "|" + ev);
    if (b && secs(b[0]) < secs(x.t) - 0.3) warn("marca mejor que el récord de su universidad", `${uni} ${g} ${ev}: récord ${x.t}, ${b[1]} ${b[0]}`);
  }
  await writeFile("web/data/nadadores.json", JSON.stringify(nad));
}

if (DESPUES) {
  // Después de split_nadadores (que junta repetidos): mismo nombre, mismo equipo y mismo sexo en el índice de la app.
  const prev = await J("auditoria.json", {});
  const idx = (await J("nad-indice.json", { s: [] })).s;
  const seen = new Set();
  prev.warn ||= {}; prev.ex ||= {}; delete prev.warn["nadador repetido"]; delete prev.ex["nadador repetido"];
  for (const [n, t, g] of idx) {
    const k = plain(n) + "|" + plain(t).replace(/\b(university|college|of|the|swimming|swim|team|[a-z]{2}$)\b/g, "").replace(/\s+/g, " ").trim() + "|" + g;
    if (!seen.has(k)) { seen.add(k); continue; }
    prev.warn["nadador repetido"] = (prev.warn["nadador repetido"] || 0) + 1;
    if ((prev.ex["nadador repetido"] ||= []).length < 8) prev.ex["nadador repetido"].push(`${n} (${t})`);
  }
  // Campos vacíos o inválidos (null, undefined, NaN, sexo o tiempo raros) en lo que lee la app.
  for (const k of ["campo vacío o inválido", "sexo dudoso por el nombre"]) { delete prev.warn[k]; delete prev.ex[k]; }
  const bad = (k, ex) => { prev.warn[k] = (prev.warn[k] || 0) + 1; if ((prev.ex[k] ||= []).length < 8) prev.ex[k].push(ex); };
  for (const r of idx) if (!r[0] || !r[1] || !/^[MW]?$/.test(r[2]) || (r[5] && !FMT.test(r[5])) || r.some((x) => /^(null|undefined|NaN)$/.test(String(x)))) bad("campo vacío o inválido", r.slice(0, 6).join(" · "));
  for (const f of ["records.json", "records-hist.json", "unis.json", "calendario.json"]) { const txt = await readFile("web/data/" + f, "utf8").catch(() => ""); const m = txt.match(/:(null|NaN)\b|"(undefined|NaN|null)"/g); if (m) bad("campo vacío o inválido", `${f}: ${m.length}`); }
  // Sexo que no cuadra con un nombre de pila clarísimo (split_nadadores ya corrige; aquí se cuenta lo que quede).
  const fc = new Map(), f0 = (n) => plain(n).split(" ")[0] || "";
  for (const [n, , g] of idx) if (g) { const c = fc.get(f0(n)) || { M: 0, W: 0 }; c[g]++; fc.set(f0(n), c); }
  for (const [n, t, g] of idx) { const c = fc.get(f0(n)); if (!g || !c) continue; const o = g === "M" ? "W" : "M"; if (c.M + c.W >= 20 && c[o] >= 0.97 * (c.M + c.W)) bad("sexo dudoso por el nombre", `${n} (${t}) ${g}`); }
  await writeFile("web/data/auditoria.json", JSON.stringify(prev));
  console.log("campos inválidos:", prev.warn["campo vacío o inválido"] || 0, "· sexo dudoso:", prev.warn["sexo dudoso por el nombre"] || 0);
  console.log("nadadores repetidos en el índice:", prev.warn["nadador repetido"] || 0, prev.ex["nadador repetido"] || []);
  process.exit(0);
}

// Récords NCAA: formato y que el de mujeres no sea más rápido que el de hombres.
for (const [div, x] of Object.entries(rec.ncaa || {})) for (const [ev, w] of Object.entries(x.W || {})) {
  const m = x.M?.[ev];
  if (!FMT.test(String(w?.t || ""))) warn("récord NCAA mal escrito", `${div} W ${ev} ${w?.t}`);
  if (m && secs(w.t) < secs(m.t)) warn("récord de mujeres más rápido que el de hombres", `${div} ${ev}`);
}

const EVS = ["50 Y Free", "100 Y Free", "200 Y Free", "500 Y Free", "1000 Y Free", "1650 Y Free", "100 Y Back", "200 Y Back", "100 Y Breast", "200 Y Breast", "100 Y Fly", "200 Y Fly", "200 Y IM", "400 Y IM"];
for (const div of ["D1", "D2", "D3"]) for (const g of ["M", "W"]) for (const ev of EVS) if (!rec.ncaa?.[div]?.[g]?.[ev]) warn("falta un récord NCAA", `${div} ${g} ${ev}`);

// Pruebas repetidas dentro de una competición (la misma prueba leída de dos fuentes, p. ej. la web de SMU y el PDF
// de Arkansas): mismo título y mismo tiempo del ganador. Se queda la que tiene más resultados y más datos.
if (!DESPUES) {
  const winT = (e) => String((e.res || []).find((r) => String(r[0]) === "1")?.[4] || e.res?.[0]?.[4] || "").replace(/^[xX*]/, "").replace(/[^0-9:.]+$/, "");
  const rich = (e) => (e.res || []).length * 100 + (e.res || []).reduce((a, r) => a + r.filter((v) => v !== "" && v != null).length, 0);
  for (const f of await readdir("web/data/m").catch(() => [])) {
    let x; try { x = JSON.parse(await readFile("web/data/m/" + f, "utf8")); } catch { continue; }
    if (!Array.isArray(x.ev) || x.ev.length < 2) continue;
    const best = new Map(), order = [];
    for (const e of x.ev) {
      const k = plain(String(e.ti).replace(/\s+(Prelims|Finals)$/i, "")) + "|" + winT(e);
      if (!winT(e)) { order.push(e); continue; }
      const o = best.get(k);
      if (!o) { best.set(k, e); order.push(e); continue; }
      fix("prueba repetida en una competición", `${x.n} · ${e.ti}`);
      if (rich(e) > rich(o)) { if (/ (Prelims|Finals)$/.test(o.ti) && !/ (Prelims|Finals)$/.test(e.ti)) e.ti = o.ti; order[order.indexOf(o)] = e; best.set(k, e); }
    }
    // Misma prueba dos veces con distinto ganador: eliminatorias y final. La que da puntos es la final.
    let named = 0;
    const byTi = new Map();
    for (const e of order) if (!/prelim|final|time trial|swim-?off/i.test(e.ti || "")) (byTi.get(plain(e.ti)) || byTi.set(plain(e.ti), []).get(plain(e.ti))).push(e);
    const pts = (e) => !!e.sc || (e.res || []).some((r) => r[6] && /^\d/.test(String(r[6])));
    for (const l of byTi.values()) if (l.length === 2 && pts(l[0]) !== pts(l[1])) { for (const e of l) e.ti += pts(e) ? " Finals" : " Prelims"; named++; }
    if (named) fix("eliminatorias y final separadas", `${x.n} (${named})`);
    if (order.length !== x.ev.length || named) { x.ev = order; await writeFile("web/data/m/" + f, JSON.stringify(x)); }
  }
}

// Competiciones repetidas: mismo día, mismos equipos y nombres casi iguales.
const byDay = new Map();
for (const m of enc.meets || []) {
  const k = m.d + "|" + [...(m.u || [])].sort().join(",");
  const words = new Set(plain(m.n).split(" ").filter((w) => w.length > 2 && !/^(vs|and|the|invite|invitational|meet|swim|dive|day|men|women|mens|womens|university)$/.test(w)));
  const sx = (n) => (/\b(w|women|womens)\b/i.test(plain(n)) ? "W" : /\b(m|men|mens)\b/i.test(plain(n)) ? "M" : "");
  for (const o of byDay.get(k) || []) { if (sx(m.n) && sx(o.n) && sx(m.n) !== sx(o.n)) continue; const inter = [...words].filter((w) => o.w.has(w)).length; if (inter && inter >= Math.min(words.size, o.w.size) && m.ev === o.ev) warn("competición repetida", `${m.n} = ${o.n} (${m.d})`); }
  (byDay.get(k) || byDay.set(k, []).get(k)).push({ n: m.n, w: words, ev: m.ev });
  if (!m.ev) warn("competición sin pruebas", `${m.n} (${m.d})`);
}

// Fuentes que dejan de dar datos: en temporada (octubre a marzo) tiene que haber resultados de los últimos 4 días.
const last = (enc.meets || []).reduce((a, m) => (m.d > a && m.d <= today ? m.d : a), "");
const mon = +today.slice(5, 7);
if ((mon >= 10 || mon <= 3) && days(last) > 4) warn("sin resultados nuevos", `último: ${last}`);
for (const [f, maxAge] of [["records.json", 10], ["internacionales.json", 10], ["enlaces.json", 3], ["escudos.json", 10], ["plantillas.json", 10]]) {
  const x = await J(f, null);
  if (!x) warn("fichero que falta", f);
  else if (days(x.updated) > maxAge) warn("fichero sin actualizar", `${f} (${x.updated})`);
}
const nBad = Object.keys(enl.bad || {}).length;
if (nBad) report.warn["enlaces rotos (se ocultan en la app)"] = nBad;

const old = await J("auditoria.json", { hist: [] });
const tot = (o) => Object.values(o).reduce((a, b) => a + b, 0);
report.hist = [...(old.hist || []).filter((h) => h.d !== today), { d: today, fixed: tot(report.fixed), warn: tot(report.warn) }].slice(-30);
await writeFile("web/data/auditoria.json", JSON.stringify(report));

const lines = ["## Auditoría de datos", "", "**Corregido solo:**", ...Object.entries(report.fixed).map(([k, v]) => `- ${k}: ${v}`), "", "**Para revisar:**", ...Object.entries(report.warn).map(([k, v]) => `- ${k}: ${v}`), "", ...Object.entries(report.ex).flatMap(([k, v]) => [`<details><summary>${k}</summary>`, "", ...v.map((x) => `- ${x}`), "</details>"])];
console.log(lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
