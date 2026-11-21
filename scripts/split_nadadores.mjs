// Divide web/data/nadadores.json (completo, lo usan los scripts) en lo que carga la app:
// - web/data/nad-indice.json: lista ligera para buscar (nombre, equipo, sexo, curso y su mejor marca).
// - web/data/nad/<xx>.json: marcas y competiciones de cada nadador, repartidos en 256 trozos (solo se baja el trozo del nadador que abres).
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
const d = JSON.parse(await readFile("web/data/nadadores.json", "utf8"));
// Mismo cálculo que en la app (web/app.js → shardOf).
export const shardOf = (k) => { let h = 2166136261; for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) & 255).toString(16).padStart(2, "0"); };
const keyOf = (n, t) => (n + "|" + t).toLowerCase().replace(/\s+/g, " ");
const secs = (t) => { const m = /^(?:(\d+):)?(\d+\.\d+)/.exec(t || ""); return m ? (+m[1] || 0) * 60 + +m[2] : Infinity; };
// La prueba "estrella": la de mejor ritmo relativo (segundos por unidad de distancia).
const pace = ([ev, v]) => secs(v[0]) / (+(/^(\d+)/.exec(ev)?.[1]) || 100);
// Alias de equipos: códigos de los resultados ("GAC-MN", "KEN", "Gusties-MN") → universidad, según en qué plantilla
// oficial (de este año o anteriores) salen sus nadadores. La app lo usa cuando el nombre no basta.
const alias = {};
let rosterWho = new Map(), rosterKey = () => "";
{
  const J = async (f) => JSON.parse(await readFile("web/data/" + f, "utf8").catch(() => "{}"));
  const [pl, past] = [(await J("plantillas.json")).plant || {}, (await J("fotos-pasadas.json")).u || {}];
  const low = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]+/g, " ").trim();
  const key = (n) => { const t = low(n).split(/\s+/).filter((x) => x.length > 1); return t.length < 2 ? "" : t[0] + "|" + t[t.length - 1]; };
  const who = new Map();
  const add = (uni, n) => { const k = key(n); if (!k) return; if (!who.has(k)) who.set(k, new Set()); who.get(k).add(uni); };
  for (const [uni, p] of Object.entries(pl)) for (const l of Object.values(p)) for (const e of l) add(uni, Array.isArray(e) ? e[0] : e);
  for (const [uni, m] of Object.entries(past)) for (const n of Object.keys(m)) add(uni, n);
  const byTeam = new Map();
  for (const s of d.swimmers) { if (!byTeam.has(s.t)) byTeam.set(s.t, []); byTeam.get(s.t).push(s.n); }
  for (const [t, ns] of byTeam) {
    const c = {};
    for (const n of ns) for (const u of who.get(key(n)) || []) c[u] = (c[u] || 0) + 1;
    const [best, hits] = Object.entries(c).sort((a, b) => b[1] - a[1])[0] || [];
    if (best && hits >= 3 && hits >= ns.length * 0.4) alias[t] = best;
  }
  rosterWho = who; rosterKey = key;
  await writeFile("web/data/alias-equipos.json", JSON.stringify({ updated: new Date().toISOString().slice(0, 10), a: alias }));
  console.log("alias de equipos:", Object.keys(alias).length, "de", byTeam.size);
}

// Todas las marcas de TODAS las competiciones guardadas (web/data/m/*.json), no solo las que se leyeron por primera vez:
// así cada nadador tiene sus mejores marcas completas aunque su nombre o su equipo salgan escritos de otra forma.
{
  const { readdir } = await import("node:fs/promises");
  const now0 = new Date();
  const minDate = `${(now0.getUTCMonth() >= 7 ? now0.getUTCFullYear() : now0.getUTCFullYear() - 1) - 1}-08-01`;
  const fixN = (n) => (n.includes(",") ? n.split(",").map((x) => x.trim()).filter(Boolean).reverse().join(" ") : n).replace(/\s+/g, " ").trim();
  const evOf = (title) => title.replace(/^(Women|Men|Girls|Boys|Mixed)\s+/i, "").replace(/\s+Yard\s+/i, " Y ").replace(/\s+LC\s+Meter\s+|\s+SC\s+Meter\s+|\s+Meter\s+/i, " M ").replace(/Freestyle/i, "Free").replace(/Backstroke/i, "Back").replace(/Breaststroke/i, "Breast").replace(/Butterfly/i, "Fly").replace(/Individual Medley/i, "IM").replace(/\s+(Time Trial|Swim-?off|Prelims|Finals|Consolation|Bonus)\b.*$/i, "").trim();
  // Equipo con un tiempo pegado ("CU 1:09.63", del tiempo de inscripción mal leído) → solo el equipo.
  const cleanTeam = (t) => String(t || "").replace(/[\s(]*[xX*]?(\d{1,2}:)?\d{1,2}\.\d{2}\b.*$/, "").replace(/^\d{2}-\d{2}\s+/, "").replace(/^GS?\s+/, "").replace(/\s*\((W|M|Men|Women)\)$/i, "").replace(/\s*\([^)]*$/, "").trim();
  // Llave del equipo: alias de plantillas, o el nombre sin región ("-NE") ni palabras de relleno ("University", "Swimming").
  const teamKey = (t0, raw = false) => {
    const t = cleanTeam(t0), t2 = t.replace(/-[A-Z]{1,3}$/, "").trim();
    const a = raw ? "" : alias[t] || alias[t2];
    const base = (a || t2).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/univeristy/g, "university");
    return base.replace(/^(the )?university of /, "").replace(/, university of,?/, "").replace(/\bsaint\b/g, "st").replace(/\bmount\b/g, "mt").replace(/\bumass\b/g, "massachusetts").replace(/\buniv\b/g, "university").replace(/\bst\.?$/, "state").replace(/\bsuny /, "").replace(/\b(university|college|swimming|swim|diving|team|athletics|aquatics|club)\b/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim() || base;
  };
  const nk = (n, t0) => nk0(n, teamKey(t0));
  const nk0 = (n, t) => n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+[a-z]\.?(?=\s)/g, "").replace(/[^a-z ]+/g, "").replace(/\s+/g, " ").trim() + "|" + t;
  const byKey = new Map();
  // Segunda llave: apellidos + equipo, para unir "Alvar" con "Alvaro" o "Matt" con "Matthew".
  const byRest = new Map();
  const restOf = (k) => { const [nm, tm] = k.split("|"); const w = nm.split(" "); return [w[0], w.slice(1).join(" ") + "|" + tm]; };
  const addRest = (k, s) => { const [f, r] = restOf(k); if (!byRest.has(r)) byRest.set(r, []); byRest.get(r).push([f, s]); };
  const findRest = (k) => { const [f, r] = restOf(k); const c = (byRest.get(r) || []).filter(([f2]) => f.length >= 3 && f2.length >= 3 && (f.startsWith(f2) || f2.startsWith(f))); return c.length === 1 ? c[0][1] : null; };
  // Nadadores repetidos (mismo nombre y equipo): se juntan en uno con todas sus marcas.
  let dupes = 0;
  const mergeInto = (o, s) => {
    for (const [e, v] of Object.entries(s.b || {})) if (!o.b?.[e] || secs(v[0]) < secs(o.b[e][0])) (o.b ||= {})[e] = v;
    for (const id of s.m || []) if (!(o.m ||= []).includes(id)) o.m.push(id);
    for (const f of ["img", "y", "g", "l", "u"]) if (!o[f] && s[f]) o[f] = s[f];
    if (s._gv) { o._gv ||= { M: 0, W: 0 }; o._gv.M += s._gv.M; o._gv.W += s._gv.W; }
    // Mejor el nombre completo del equipo que un código.
    if (/^[A-Z0-9]{2,6}(-[A-Z]{2})?$/.test(o.t) && !/^[A-Z0-9]{2,6}(-[A-Z]{2})?$/.test(s.t)) o.t = s.t;
    dupes++;
  };
  {
    const dropped = new Set();
    for (const s of d.swimmers) {
      s.t = cleanTeam(s.t) || s.t;
      const k = nk(s.n, s.t);
      const o = byKey.get(k);
      if (!o) { byKey.set(k, s); addRest(k, s); continue; }
      mergeInto(o, s); dropped.add(s);
    }
    if (dropped.size) d.swimmers = d.swimmers.filter((s) => !dropped.has(s));
  }
  // Mismo nombre con el equipo en siglas y en nombre completo ("BSU" y "Bridgewater State University").
  const words = (t) => cleanTeam(t).replace(/-[A-Z]{1,3}$/, "").split(/[\s.,]+/).filter(Boolean);
  const initials = (t) => { const w = words(t).filter((x) => !/^(the|and|at)$/i.test(x)); return [w.filter((x) => !/^of$/i.test(x) && /^[A-Z]/.test(x)).map((x) => x[0]).join(""), w.map((x) => x[0].toUpperCase()).join("")]; };
  // ¿Es el mismo equipo escrito de otra forma? Siglas ("BSU"), principio del nombre ("ROCK" → Rockhurst) o nombre cortado ("Long" → Long Island).
  const sameTeam = (a, b) => {
    const ka = teamKey(a), kb = teamKey(b);
    // Nombre cortado: solo si el corto es una sola palabra y no es un estado ("Massachusetts" ≠ "Massachusetts Dartmouth").
    const STATE = /^(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new|north|south|ohio|oklahoma|oregon|pennsylvania|rhode|tennessee|texas|utah|vermont|virginia|washington|west|wisconsin|wyoming|cal|penn|western|eastern|northern|southern|central)$/;
    const short = ka.length < kb.length ? ka : kb, long = ka.length < kb.length ? kb : ka;
    if (short && !short.includes(" ") && !STATE.test(short) && long.startsWith(short + " ")) return true;
    const code = cleanTeam(a).replace(/-[A-Z]{1,3}$/, "");
    if (!/^[A-Z]{2,6}$/.test(code)) return false;
    if (initials(b).includes(code)) return true;
    return code.length >= 4 && kb.split(" ").some((w) => w.startsWith(code.toLowerCase()));
  };
  const mergeInitials = () => {
    const byName = new Map();
    // Agrupa por apellido; dentro, mismo nombre o nombre cortado ("Michaeldim" / "Michaeldimi", "Matt" / "Matthew").
    const nm = (s) => nk0(s.n, "").replace(/\|$/, "").split(" ");
    for (const s of d.swimmers) { const w = nm(s); const k = w[w.length - 1]; if (!byName.has(k)) byName.set(k, []); byName.get(k).push(s); }
    const firstOk = (a, b) => { const fa = nm(a)[0], fb = nm(b)[0]; return nm(a).length >= 2 && nm(b).length >= 2 && (fa === fb || (fa.length >= 4 && fb.length >= 4 && (fa.startsWith(fb) || fb.startsWith(fa)))); };
    const dropped = new Set();
    for (const list of byName.values()) {
      if (list.length < 2) continue;
      for (const a of list) {
        if (dropped.has(a)) continue;
        const full = list.filter((b) => b !== a && !dropped.has(b) && firstOk(a, b) && (teamKey(a.t) === teamKey(b.t) || teamKey(a.t, true) === teamKey(b.t, true) || teamKey(a.t) === teamKey(b.t, true) || teamKey(a.t, true) === teamKey(b.t) || sameTeam(a.t, b.t)));
        if (full.length === 1) { mergeInto(full[0], a); dropped.add(a); }
      }
    }
    if (dropped.size) d.swimmers = d.swimmers.filter((s) => !dropped.has(s));
  };
  mergeInitials();
  d.mi ||= {};
  // Marca imposible: más rápida que el récord NCAA de la División I (de su sexo; sin sexo, el masculino) o con un ritmo
  // demasiado lento para la prueba. Suelen ser tiempos de otra prueba mal leídos. Se borran y se vuelven a buscar.
  const REC = ((await readFile("web/data/records.json", "utf8").then(JSON.parse).catch(() => null))?.ncaa?.D1) || { M: {}, W: {} };
  const capOf = (ev) => { const em = /^(\d+) ([YM]) (Free|Back|Breast|Fly|IM)$/.exec(ev); return em ? [+em[1], { Free: 0.9, Back: 1.0, Fly: 1.0, Breast: 1.1, IM: 1.0 }[em[3]] * (em[2] === "M" ? 1.12 : 1)] : null; };
  const okMark = (ev, t, g) => {
    const c = capOf(ev); if (!c) return false;
    const sec = secs(t), pc = sec / c[0];
    if (!(pc >= 0.36 && pc <= c[1])) return false;
    const top = REC[g || "M"]?.[ev] || REC.M?.[ev];
    return !top || sec >= secs(top.t) - 0.01;
  };
  let purged = 0;
  for (const s of d.swimmers) for (const [ev, v] of Object.entries(s.b || {})) if (/^(\d+) ([YM]) (Free|Back|Breast|Fly|IM)$/.test(ev) && !okMark(ev, v[0], s.g)) { delete s.b[ev]; purged++; }
  console.log("marcas imposibles borradas:", purged);
  let added = 0, better = 0, files = 0, taFiles = 0;
  const taAll = {};
  const aliasOf = {};
  for (const f of await readdir("web/data/m").catch(() => [])) {
    let x;
    try { x = JSON.parse(await readFile("web/data/m/" + f, "utf8")); } catch { continue; }
    const id = "r:" + f.replace(/\.json$/, "");
    if (x.alias) { aliasOf[id] = x.alias; continue; }
    files++;
    // Códigos de equipo de ESTA competición ("NS", "CN") → universidad, por los nadadores que salen en su plantilla.
    {
      const cnt = {};
      for (const ev of x.ev || []) for (const r of ev.res || []) {
        const [, n0, team] = r;
        if (!n0 || !team || alias[team]) continue;
        const c = (cnt[team] ||= { _n: new Set() });
        const nm = fixN(n0);
        if (c._n.has(nm)) continue;
        c._n.add(nm);
        for (const u of rosterWho.get(rosterKey(nm)) || []) c[u] = (c[u] || 0) + 1;
      }
      const ta = {};
      for (const [team, c] of Object.entries(cnt)) {
        const tot = c._n.size; delete c._n;
        const [best, hits] = Object.entries(c).sort((a, b) => b[1] - a[1])[0] || [];
        if (best && hits >= 2 && hits >= tot * 0.5) ta[team] = best;
      }
      const had = JSON.stringify(x.ta || {});
      if (Object.keys(ta).length) x.ta = ta; else delete x.ta;
      if (JSON.stringify(x.ta || {}) !== had) { await writeFile("web/data/m/" + f, JSON.stringify(x)); taFiles++; }
      for (const [k, v] of Object.entries(x.ta || {})) taAll[k + "|" + id] = v;
    }
    d.mi[id] ||= [x.n, x.d];
    for (const ev of x.ev || []) {
      if (ev.r || /diving/i.test(ev.ti || "")) continue;
      const evn = evOf(ev.ti || "");
      const em = /^(\d+) ([YM]) (Free|Back|Breast|Fly|IM)$/.exec(evn);
      if (!em) continue;
      const g = /women|girls/i.test(ev.ti) ? "W" : /\bmen\b|boys/i.test(ev.ti) ? "M" : "";
      for (const r of ev.res || []) {
        const [, n0, team, yr, m] = r;
        if (!n0 || !team || !/^[\p{L}][\p{L}'’.,\- ]+$/u.test(n0.trim()) || /^[A-Z0-9-]+$/.test(n0.trim())) continue;
        const t = String(m || "").replace(/^[xX*]/, "").replace(/[A-Za-z!#$&*@^]+$/, "");
        const sec = secs(t);
        if (sec === Infinity) continue;
        const pc = sec / +em[1];
        // Ritmo imposible para un universitario (p. ej. un 100 libre en 1:44 suele ser otra prueba mal leída).
        const cap = { Free: 0.9, Back: 1.0, Fly: 1.0, Breast: 1.1, IM: 1.0 }[em[3]] * (em[2] === "M" ? 1.12 : 1);
        if (pc < 0.36 || pc > cap || !okMark(evn, t, g)) continue;
        const name = fixN(n0);
        if (name.split(" ").length < 2) continue;
        const k = nk(name, x.ta?.[team] || team);
        let sw = byKey.get(k) || findRest(k);
        if (sw) byKey.set(k, sw);
        if (!sw) {
          if (!x.d || x.d < minDate) continue;
          sw = { n: name.replace(/\s+[A-Z]\.?(?=\s)/g, ""), t: x.ta?.[team] || cleanTeam(team) || team, g, b: {}, m: [] };
          if (n0.includes(",")) sw.l = n0.split(",")[0].trim();
          d.swimmers.push(sw); byKey.set(k, sw); addRest(k, sw); added++;
        }
        sw.g ||= g;
        if (g) (sw._gv ||= { M: 0, W: 0 })[g]++;
        if (!sw.b[evn] || sec < secs(sw.b[evn][0])) { sw.b[evn] = [t, "", id]; better++; }
        if (!sw.m.includes(id)) sw.m.push(id);
      }
    }
  }
  // Mejores marcas que la propia universidad publica en la biografía ("TOP TIMES: 100 Free: 43.83 …"): completan las
  // pruebas que no salen en los resultados guardados. Solo yardas y solo para nadadores que ya existen en esa universidad.
  {
    const unisL = (await readFile("web/data/unis.json", "utf8").then(JSON.parse).catch(() => ({ unis: [] }))).unis;
    const slugU = (n) => n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const uniOfSlug = new Map(unisL.map((u) => [slugU(u.n), u.n]));
    const byFull = new Map();
    for (const sw of d.swimmers) { const k = nk0(sw.n, ""); if (!byFull.has(k)) byFull.set(k, []); byFull.get(k).push(sw); }
    const ST = { free: "Free", freestyle: "Free", back: "Back", backstroke: "Back", breast: "Breast", breaststroke: "Breast", fly: "Fly", butterfly: "Fly", im: "IM" };
    let bioMarks = 0;
    const { readdir } = await import("node:fs/promises");
    for (const f of await readdir("web/data/bio").catch(() => [])) {
      const uni = uniOfSlug.get(f.replace(/\.json$/, ""));
      if (!uni) continue;
      let bj; try { bj = JSON.parse(await readFile("web/data/bio/" + f, "utf8")); } catch { continue; }
      const uk = teamKey(uni);
      for (const [name, v] of Object.entries(bj.p || {})) {
        const txt = String(v?.b || "");
        const hm = /(top|best|personal[- ]best|lifetime[- ]best|career[- ]best)s?\s*(times?|marks?)?\s*:?/i.exec(txt);
        if (!hm) continue;
        const sw = (byFull.get(nk0(name, "")) || []).find((x) => teamKey(x.t) === uk || sameTeam(x.t, uni) || alias[x.t] === uni);
        if (!sw) continue;
        let seen = 0;
        for (const line of txt.slice(hm.index).split("\n").slice(0, 25)) {
          const m = /^\s*(50|100|200|400|500|1000|1650)\s*(?:y(?:ar)?ds?\.?\s*)?(free(?:style)?|back(?:stroke)?|breast(?:stroke)?|fly|butterfly|im)\b[^0-9]{0,6}((?:\d{1,2}:)?\d{2}\.\d{2})\b/i.exec(line);
          if (!m) { if (seen && !/^\s*$/.test(line)) break; continue; }
          seen++;
          if (/\b(lcm|scm|meters?|metres?|long course)\b/i.test(line)) continue;
          const ev = `${m[1]} Y ${ST[m[2].toLowerCase()]}`;
          const t = m[3];
          if (!okMark(ev, t, sw.g)) continue;
          if (!sw.b[ev] || secs(t) < secs(sw.b[ev][0])) { sw.b[ev] = [t, "Web de la universidad", ""]; bioMarks++; }
        }
      }
    }
    console.log("mejores marcas sacadas de las biografías:", bioMarks);
  }
  mergeInitials();
  // Mismo nombre completo con otro equipo: si el equipo es basura ("20", "New", "University", siglas sueltas) y solo hay
  // un candidato, es él; si los dos tienen la misma prueba con tiempos casi iguales (±3,5 %), es la misma persona
  // (cambio de universidad o equipo escrito de otra forma). Se queda el que tiene más competiciones.
  {
    const groups = new Map();
    for (const sw of d.swimmers) { const k = nk0(sw.n, ""); if (k.split(" ").length < 2) continue; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(sw); }
    const weak = (t) => { const c = cleanTeam(t).replace(/-[A-Z]{1,3}$/, "").trim(); return !c || /^\d/.test(c) || /^(new|university|college|univ|team|the|simon|north|south|east|west|saint|st)$/i.test(c) || (/^[A-Z]{1,3}$/.test(c) && !alias[c] && !alias[cleanTeam(t)]); };
    const similar = (a, b) => { let n = 0, ok = 0; for (const [ev, v] of Object.entries(a.b || {})) { const w = b.b?.[ev]; if (!w) continue; const r = secs(v[0]) / secs(w[0]); n++; if (r > 0.965 && r < 1.035) ok++; } return ok >= 1 && ok * 2 >= n; };
    const dropped = new Set();
    let sim = 0;
    for (const list of groups.values()) {
      if (list.length < 2 || list.length > 4) continue;
      for (const a of list) {
        if (dropped.has(a)) continue;
        const rest = list.filter((b) => b !== a && !dropped.has(b));
        const strong = rest.filter((b) => !weak(b.t));
        let into = null;
        if (weak(a.t) && strong.length === 1) into = strong[0];
        else { const c = rest.filter((b) => similar(a, b)); if (c.length === 1) into = c[0]; }
        if (!into) continue;
        const [keep, gone] = (into.m?.length || 0) >= (a.m?.length || 0) || weak(a.t) ? [into, a] : [a, into];
        mergeInto(keep, gone); dropped.add(gone); sim++;
      }
    }
    if (dropped.size) d.swimmers = d.swimmers.filter((s) => !dropped.has(s));
    console.log("mismo nadador con otro equipo, juntados:", sim);
  }
  console.log("nadadores repetidos juntados:", dupes);
  // Sexo por mayoría de las pruebas en que sale (un título mal leído no lo cambia).
  let gFix = 0;
  for (const sw of d.swimmers) {
    const v = sw._gv; delete sw._gv;
    if (!v) continue;
    const g2 = v.M > v.W * 2 ? "M" : v.W > v.M * 2 ? "W" : "";
    if (g2 && sw.g !== g2) { sw.g = g2; gFix++; }
  }
  console.log("sexo corregido:", gFix);
  // Piezas de una competición unida (Day 1, Day 2…) → la competición completa.
  const fin = (id) => aliasOf[id] || id;
  for (const id of Object.keys(aliasOf)) delete d.mi[id];
  for (const sw of d.swimmers) {
    if (sw.m.some((x) => aliasOf[x])) sw.m = [...new Set(sw.m.map(fin))];
    for (const v of Object.values(sw.b)) if (aliasOf[v[2]]) v[2] = fin(v[2]);
  }
  // Últimas 15 competiciones de cada uno, de la más antigua a la más reciente.
  const dt = (x) => (d.mi[x] ? d.mi[x][1] : "") || "";
  for (const sw of d.swimmers) if (sw.m.length > 1) sw.m = sw.m.sort((a, b) => dt(a).localeCompare(dt(b))).slice(-15);
  console.log("códigos de equipo resueltos por competición:", Object.keys(taAll).length, "· ficheros actualizados:", taFiles);
  console.log("competiciones guardadas leídas:", files, "· marcas mejoradas:", better, "· nadadores nuevos:", added);
}

const idx = [], shards = {};
const mi = d.mi || {};
for (const s of d.swimmers) {
  const ent = Object.entries(s.b || {});
  const top = ent.sort((a, b) => pace(a) - pace(b))[0];
  idx.push([s.n, s.t, s.g || "", s.y || "", top ? top[0] : "", top ? top[1][0] : "", s.l || ""]);
  const sk = shardOf(keyOf(s.n, s.t));
  const sh = (shards[sk] ||= { s: {}, mi: {} });
  sh.s[keyOf(s.n, s.t)] = [s.b, s.m];
  for (const v of Object.values(s.b || {})) if (v[2] && mi[v[2]]) sh.mi[v[2]] = mi[v[2]];
  for (const x of s.m || []) if (mi[x]) sh.mi[x] = mi[x];
}
await rm("web/data/nad", { recursive: true, force: true });
await mkdir("web/data/nad", { recursive: true });
for (const [k, v] of Object.entries(shards)) await writeFile(`web/data/nad/${k}.json`, JSON.stringify(v));
await writeFile("web/data/nad-indice.json", JSON.stringify({ v: 1, updated: d.updated || new Date().toISOString().slice(0, 10), s: idx }));
console.log("índice:", idx.length, "nadadores ·", JSON.stringify(idx).length, "bytes · trozos:", Object.keys(shards).length);

// Equipos: mejores tiempos de la temporada por prueba, con TODOS los resultados guardados de esta temporada
// (web/data/m/*.json, incluidos relevos) más las mejores marcas de nadadores.json.
import { norm } from "../web/logos.js";
import { readdir } from "node:fs/promises";
const now = new Date();
const seasonStart = `${now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1}-08-01`;
const slugT = (t) => norm(t).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";
const shortEv = (title) => title.replace(/^(Women|Men|Girls|Boys|Mixed)\s+/i, "").replace(/\s+Yard\s+/i, " Y ").replace(/\s+LC\s+Meter\s+|\s+SC\s+Meter\s+|\s+Meter\s+/i, " M ").replace(/Freestyle/i, "Free").replace(/Backstroke/i, "Back").replace(/Breaststroke/i, "Breast").replace(/Butterfly/i, "Fly").replace(/Individual Medley/i, "IM").replace(/\s+(Time Trial|Swim-?off|Prelims|Finals|Consolation|Bonus)\b.*$/i, "").trim();
const sexOfT = (t) => (/women|girls/i.test(t) ? "W" : /\bmen\b|boys/i.test(t) ? "M" : "");
const fixName = (n) => (n.includes(",") ? n.split(",").map((x) => x.trim()).filter(Boolean).reverse().join(" ") : n).replace(/\s+/g, " ").trim().replace(/\s+[A-Z]\.?(?=\s)/g, "");
const IND = /^\d+ [YM] (Free|Back|Breast|Fly|IM)$/, REL = /^\d+ [YM] (Free|Medley) Relay$/;
// Dos temporadas: la actual y la anterior completa (la app usa la anterior hasta que la actual tenga datos suficientes).
const prevStart = `${+seasonStart.slice(0, 4) - 1}-08-01`;
const NCAA_EV = new Set(["50 Y Free", "100 Y Free", "200 Y Free", "500 Y Free", "1000 Y Free", "1650 Y Free", "100 Y Back", "200 Y Back", "100 Y Breast", "200 Y Breast", "100 Y Fly", "200 Y Fly", "200 Y IM", "400 Y IM", "200 Y Free Relay", "400 Y Free Relay", "800 Y Free Relay", "200 Y Medley Relay", "400 Y Medley Relay"]);
const seasons = { cur: { teams: {}, meets: 0 }, prev: { teams: {}, meets: 0 } };
const which = (dt) => (!dt ? "" : dt >= seasonStart ? "cur" : dt >= prevStart ? "prev" : "");
const T0 = (S, raw) => (S.teams[slugT(raw)] ||= { n: raw, M: {}, W: {}, RM: {}, RW: {} });
// Llave del nadador en el ranking: apellido + 4 primeras letras del nombre (une "Michaeldim"/"Michaeldimi", "Alvar"/"Alvaro").
const whoKey = (n) => { const w = n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]+/g, " ").trim().split(/\s+/); return w.length < 2 ? w.join(" ") : w[0].slice(0, 4) + " " + w.slice(1).join(" "); };
// Ningún tiempo puede ser más rápido que el récord NCAA de la División I (relevos incluidos): si lo es, está mal leído.
const REC_D1 = ((await readFile("web/data/records.json", "utf8").then(JSON.parse).catch(() => null))?.ncaa?.D1) || { M: {}, W: {} };
const possible = (ev, t, g) => { const top = REC_D1[g]?.[ev] || REC_D1.M?.[ev]; return !top || secs(t) >= secs(top.t) - 0.01; };
const put = (bag, ev, t, who, g) => {
  if (g && !possible(ev, t, g)) return;
  const k = typeof who === "string" ? whoKey(who) : who.map(whoKey).sort().join("|");
  const l = (bag[ev] ||= new Map());
  const prev = l.get(k);
  if (!prev || secs(t) < secs(prev[0])) l.set(k, [t, who]);
};
for (const f of await readdir("web/data/m").catch(() => [])) {
  let x;
  try { x = JSON.parse(await readFile("web/data/m/" + f, "utf8")); } catch { continue; }
  const S = seasons[which(x.d)];
  if (!S) continue;
  S.meets++;
  for (const ev of x.ev || []) {
    const g = sexOfT(ev.ti || ""), evn = shortEv(ev.ti || "");
    if (!g) continue;
    const rel = REL.test(evn);
    if (!rel && !IND.test(evn)) continue;
    for (const r of ev.res || []) {
      const [, n, team, , m] = r;
      const t = String(m || "").replace(/^[xX*]/, "").replace(/[A-Za-z!#$&*@^]+$/, "");
      if (!team || secs(t) === Infinity) continue;
      const pc = secs(t) / +evn.split(" ")[0];
      const st = /Back|Fly|IM/.test(evn) ? 1.0 : /Breast/.test(evn) ? 1.1 : 0.9;
      if (pc < (rel ? 0.33 : 0.36) || pc > st * (/ M /.test(evn) ? 1.12 : 1)) continue;
      if (rel) { const sw = (r[8] || []).map(fixName); put(T0(S, x.ta?.[team] || team)["R" + g], evn, t, sw.length ? sw : [r[7] || "A"], g); }
      else if (n && /^[\p{L}][\p{L}'’.,\- ]+$/u.test(n.trim())) put(T0(S, x.ta?.[team] || team)[g], evn, t, fixName(n), g);
    }
  }
}
// Fecha de las marcas que vienen de competiciones HY-TEK del archivo (v[2] es su dirección, no un id guardado):
// antes se perdían y equipos como Texas o Florida no salían en el ranking de esta temporada.
const archDate = new Map();
for (const m of (await readFile("web/data/archivo.json", "utf8").then(JSON.parse).catch(() => ({ meets: [] }))).meets || []) { const u = m.url.split("#")[0]; if (m.start) { archDate.set(u, m.start); archDate.set(m.name, m.start); } }
const dateOfMark = (v) => (v[2] && mi[v[2]] ? mi[v[2]][1] : archDate.get(String(v[2] || "").split("#")[0]) || archDate.get(v[1]) || "");
for (const sw of d.swimmers) {
  const g = sw.g === "M" || sw.g === "W" ? sw.g : "";
  if (!g || !sw.t) continue;
  for (const [ev, v] of Object.entries(sw.b || {})) {
    if (!IND.test(ev)) continue;
    const S = seasons[which(dateOfMark(v))];
    if (S) put(T0(S, sw.t)[g], ev, v[0], sw.n, g);
  }
}
await rm("web/data/equipos", { recursive: true, force: true });
await mkdir("web/data/equipos", { recursive: true });
// Ranking compacto: centésimas como números y solo las pruebas que puntúan en los campeonatos NCAA.
const cs = (t) => Math.round(secs(t) * 100);
const rank = { cur: {}, prev: {} }, files = {};
// Solo equipos universitarios (los clubes y colegios que nadan en algunos encuentros no hacen falta).
const unisAll = JSON.parse(await readFile("web/data/unis.json", "utf8")).unis;
const uniKeys = new Set(unisAll.flatMap((u) => [u.n, u.full, `${u.n} ${u.nick || ""}`].filter(Boolean).map((x) => norm(x))));
const isUni = (raw) => alias[raw] || uniKeys.has(norm(raw)) || uniKeys.has(norm(raw.replace(/-[A-Z]{2}$/, ""))) || /universit|college|\bU\b|institute|academy/i.test(raw);
for (const [sk, S] of Object.entries(seasons)) for (const [k, T] of Object.entries(S.teams)) {
  if (!isUni(T.n)) continue;
  const out = { M: {}, W: {}, R: { M: {}, W: {} } }, best = { M: {}, W: {} };
  for (const g of ["M", "W"]) {
    for (const [ev, l] of Object.entries(T[g])) {
      // Fuera tiempos imposibles para esa prueba (otra prueba mal leída): más de un 30 % peor que el mejor del equipo.
      let list = [...l.values()].sort((a, b) => secs(a[0]) - secs(b[0]));
      list = list.filter((x) => secs(x[0]) <= secs(list[0][0]) * 1.3);
      out[g][ev] = list.slice(0, 10);
      if (NCAA_EV.has(ev)) best[g][ev] = list.slice(0, 3).map((x) => cs(x[0]));
    }
    for (const [ev, l] of Object.entries(T["R" + g])) {
      const list = [...l.values()].sort((a, b) => secs(a[0]) - secs(b[0]));
      out.R[g][ev] = list.slice(0, 3);
      if (NCAA_EV.has(ev)) best[g][ev] = [cs(list[0][0])];
    }
  }
  (files[k] ||= { n: T.n })[sk] = out;
  if (Object.keys(best.M).length || Object.keys(best.W).length) rank[sk][k] = [T.n, best];
}
for (const [k, v] of Object.entries(files)) await writeFile(`web/data/equipos/${k}.json`, JSON.stringify(v));
const label = (st) => `${st.slice(0, 4)}-${String(+st.slice(2, 4) + 1).padStart(2, "0")}`;
await writeFile("web/data/equipos-rank.json", JSON.stringify({ v: 2, updated: new Date().toISOString().slice(0, 10), cur: { season: label(seasonStart), meets: seasons.cur.meets, t: rank.cur }, prev: { season: label(prevStart), meets: seasons.prev.meets, t: rank.prev } }));
console.log("equipos:", Object.keys(files).length, "· competiciones:", seasons.cur.meets, "esta temporada,", seasons.prev.meets, "la anterior · ranking:", JSON.stringify(rank).length, "bytes");

