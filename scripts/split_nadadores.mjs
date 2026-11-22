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
let rosterWho = new Map(), rosterKey = () => "", rosterSex = new Map();
// Apodos: "Oli" y "Oliver" son la misma persona.
const NICK = new Map();
for (const grp of ["joseph joe joey jo", "john jack johnny jon", "michael mike mikey mick", "katherine kathryn katelyn katie kate kat kathy catherine cate", "jacob jake jakob", "samuel sam sammy", "samantha sam sammie", "william will billy bill liam", "robert rob bob bobby robbie", "alexander alex xander", "alexandra alex alexa lexi", "matthew matt matty", "nicholas nick nico nicolas", "christopher chris topher", "thomas tom tommy", "daniel dan danny", "benjamin ben benji benny", "anthony tony", "elizabeth liz lizzie libby beth eliza ellie", "margaret maggie meg peggy", "megan meg", "abigail abby abbie", "gabriella gabrielle gabby gabi", "gabriel gabe", "eleanor ellie elle nora", "james jim jimmy jamie", "andrew andy drew", "edward ed eddie ted", "charles charlie chuck", "zachary zach zack", "maximilian max", "nathan nate nathaniel", "joshua josh", "timothy tim timmy", "stephen steven steve", "gregory greg", "patrick pat", "jennifer jen jenny", "rebecca becca becky", "allison ally allie", "madison maddie maddy", "madeline maddie maddy madelyn", "olivia liv livvy", "oliver ollie oli", "olivia oli", "harrison harry", "henry harry hank", "frederick fred freddie", "jonathan jon jonny", "dominic dom", "sebastian seb", "nicole nikki nicki", "natalie nat", "kimberly kim", "jessica jess jessie", "theodore theo teddy", "leonardo leo", "mitchell mitch", "zoe zoey", "emily em emmy", "emilia emelia emmy", "isabella isabel bella izzy", "victoria tori vicky", "anne annie ann anna", "kamdyn kami", "reginald reggie", "regan reggie", "janos jancsi", "oceane oc", "rudy ru", "justin jb", "isabelle izzy isabel", "isadora izzy", "isobel izzy", "lucas luke", "allison ali", "evelyn evie", "jocelyn josie", "josephine josie", "volodymyr vova", "nikola nick", "michail mike", "mingna min", "elizabeth ella", "eleanor ella", "cameron cam", "connor cam"]) { const w = grp.split(" "); for (const x of w) (NICK.get(x) || NICK.set(x, []).get(x)).push(w[0]); }
{
  const J = async (f) => JSON.parse(await readFile("web/data/" + f, "utf8").catch(() => "{}"));
  const [pl, past] = [(await J("plantillas.json")).plant || {}, (await J("fotos-pasadas.json")).u || {}];
  const low = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]+/g, " ").trim();
  const key = (n) => { const t = low(n).split(/\s+/).filter((x) => x.length > 1); return t.length < 2 ? "" : t[0] + "|" + t[t.length - 1]; };
  const who = new Map();
  const add = (uni, n) => { const k = key(n); if (!k) return; if (!who.has(k)) who.set(k, new Set()); who.get(k).add(uni); };
  for (const [uni, p] of Object.entries(pl)) for (const l of Object.values(p)) for (const e of l) add(uni, Array.isArray(e) ? e[0] : e);
  // Sexo según la plantilla oficial (listas M/W separadas): manda sobre cualquier otra pista.
  for (const [uni, p] of Object.entries(pl)) for (const g of ["M", "W"]) for (const e of p[g] || []) { const k = key(Array.isArray(e) ? e[0] : e); if (k) rosterSex.set(k + "|" + uni, rosterSex.has(k + "|" + uni) && rosterSex.get(k + "|" + uni) !== g ? "?" : g); }
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
    // Equipos que comparten una palabra propia ("Queens University Charlotte" / "Queens (Nc)", "Suny-Delhi Swim" / "Suny Delhi-AD")
    // y no tienen estados distintos: con el mismo nombre completo y sexo, es la misma persona.
    const GEN = /^(state|north|south|east|west|central|northern|southern|eastern|western|christian|baptist|methodist|lutheran|technology|tech|institute|community|valley|river|lake|city|new|york|american|national|international|maritime|coast|mountain|wesleyan|catholic|county|metro|pacific|atlantic)$/;
    const words = (t) => new Set(teamKey(t).split(" ").filter((w) => w.length >= 4 && !GEN.test(w)));
    const region = (t) => (/-([A-Z]{2})$/.exec(cleanTeam(t)) || /\(([A-Z][A-Za-z])\)$/.exec(cleanTeam(t)) || [])[1]?.toUpperCase() || "";
    const shareWord = (a, b) => { if (a.g !== b.g || !a.g) return false; const ra = region(a.t), rb = region(b.t); if (ra && rb && ra !== rb) return false; const wb = words(b.t); return [...words(a.t)].some((w) => wb.has(w)); };
    const dropped = new Set();
    let sim = 0;
    for (const list of groups.values()) {
      if (list.length < 2 || list.length > 8) continue;
      for (const a of list) {
        if (dropped.has(a)) continue;
        const rest = list.filter((b) => b !== a && !dropped.has(b));
        const strong = rest.filter((b) => !weak(b.t));
        let into = null;
        if (weak(a.t) && strong.length === 1) into = strong[0];
        else { const c = rest.filter((b) => similar(a, b)); if (c.length === 1) into = c[0]; }
        if (!into) { const c = rest.filter((b) => shareWord(a, b)); if (c.length) into = c.sort((x, y) => (y.m?.length || 0) - (x.m?.length || 0))[0]; }
        if (!into) continue;
        const [keep, gone] = (into.m?.length || 0) >= (a.m?.length || 0) || weak(a.t) ? [into, a] : [a, into];
        mergeInto(keep, gone); dropped.add(gone); sim++;
      }
    }
    if (dropped.size) d.swimmers = d.swimmers.filter((s) => !dropped.has(s));
    console.log("mismo nadador con otro equipo, juntados:", sim);
  }
  // Mismo equipo y el nombre escrito de otra forma: apellidos al revés ("Ciotti Anthony"), con o sin guion
  // ("Lopez Vergara"/"Lopez-Vergara"), solo un apellido ("Mariana Diaz"/"Mariana Diaz-Ponce") o la "f" perdida
  // al leer el PDF ("So ia"/"Soϐia"/"Sofia"). Se queda el nombre de la plantilla oficial, o el más largo.
  {
    for (const sw of d.swimmers) if (sw.n.includes("ϐ")) sw.n = sw.n.replace(/ϐ/g, "f");
    const tk = (n) => n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]+/g, " ").trim().split(/\s+/).filter(Boolean);
    const same = (a, b) => {
      const A = tk(a.n), B = tk(b.n);
      if (A.length < 2 || B.length < 2) return false;
      if ([...A].sort().join(" ") === [...B].sort().join(" ")) return true;
      if (A.join("").replace(/f/g, "") === B.join("").replace(/f/g, "") && Math.abs(A.join("").length - B.join("").length) <= 1) return true;
      const nickOf = (x) => NICK.get(x) || [x];
      if (A[0] !== B[0] && !nickOf(A[0]).some((h) => nickOf(B[0]).includes(h))) return false;
      const ra = A.slice(1), rb = B.slice(1);
      if (!(ra.every((x) => rb.includes(x)) || rb.every((x) => ra.includes(x)))) return false;
      const ua = rosterWho.get(rosterKey(a.n)), ub = rosterWho.get(rosterKey(b.n));
      return !(ua && ub && rosterKey(a.n) !== rosterKey(b.n) && [...ua].some((u) => ub.has(u)));
    };
    const groups = new Map();
    for (const sw of d.swimmers) { const k = teamKey(sw.t) + "|" + (sw.g || ""); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(sw); }
    const dropped = new Set();
    let n2 = 0;
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const byLast = new Map();
      for (const sw of list) for (const w of new Set(tk(sw.n))) { if (!byLast.has(w)) byLast.set(w, []); byLast.get(w).push(sw); }
      for (const a of list) {
        if (dropped.has(a)) continue;
        const cand = new Set();
        for (const w of tk(a.n)) for (const b of byLast.get(w) || []) if (b !== a && !dropped.has(b)) cand.add(b);
        for (const sw of list) if (sw !== a && !dropped.has(sw) && sw.n.replace(/[\sf]/gi, "") === a.n.replace(/[\sf]/gi, "")) cand.add(sw);
        for (const b of cand) {
          if (dropped.has(b) || dropped.has(a) || !same(a, b)) continue;
          const score = (x) => (rosterWho.has(rosterKey(x.n)) ? 1000 : 0) + x.n.length;
          const [keep, gone] = score(a) >= score(b) ? [a, b] : [b, a];
          if (process.env.VER && tk(keep.n)[0] !== tk(gone.n)[0]) console.log("apodo:", keep.n, "<-", gone.n, "·", keep.t);
          mergeInto(keep, gone); dropped.add(gone); n2++;
        }
      }
    }
    if (dropped.size) d.swimmers = d.swimmers.filter((s) => !dropped.has(s));
    console.log("mismo equipo, nombre escrito de otra forma, juntados:", n2);
  }
  // Última pasada: nombres cortados por HY-TEK ("Aar Parseghian", "A Sliman"), erratas de una letra ("Gabriellle",
  // "Griffley"), curso metido en el nombre ("Brandon FR Wilson") y el mismo equipo con otro código (alias de plantillas).
  // Solo se juntan si hay un único candidato y nunca si los dos nadan en la misma competición (serían dos personas).
  {
    for (const sw of d.swimmers) sw.n = sw.n.replace(/\s+(FR|SO|JR|SR|GR|5Y)\s+/g, " ").replace(/\s*-\s+/g, "-").replace(/\s{2,}/g, " ").trim();
    const tk = (n) => n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]+/g, " ").trim().split(/\s+/).filter(Boolean);
    const lev = (a, b) => { if (Math.abs(a.length - b.length) > 1) return 9; let p = [...Array(b.length + 1).keys()]; for (let i = 1; i <= a.length; i++) { const c = [i]; for (let k = 1; k <= b.length; k++) c[k] = Math.min(p[k] + 1, c[k - 1] + 1, p[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1)); p = c; } return p[b.length]; };
    const nickOf = (x) => NICK.get(x) || [x];
    const firstSame = (fa, fb) => fa === fb || fa.startsWith(fb) || fb.startsWith(fa) || nickOf(fa).some((h) => nickOf(fb).includes(h)) || (Math.min(fa.length, fb.length) >= 4 && lev(fa, fb) <= 1);
    const like = (a, b) => {
      const A = tk(a.n), B = tk(b.n);
      if (A.length < 2 || B.length < 2 || A.join(" ") === B.join(" ")) return A.join(" ") === B.join(" ") && A.length >= 2;
      const la = A[A.length - 1], lb = B[B.length - 1];
      if (la === lb) return firstSame(A[0], B[0]);
      return A[0] === B[0] && Math.min(la.length, lb.length) >= 6 && lev(la, lb) <= 1;
    };
    const groups = new Map();
    for (const sw of d.swimmers) { if (!sw.g) continue; const t = cleanTeam(sw.t) || sw.t; const k = (alias[sw.t] || alias[t] || alias[t.replace(/-[A-Z]{2}$/, "")] || teamKey(sw.t)) + "|" + sw.g; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(sw); }
    const dropped = new Set();
    let n3 = 0;
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const byLast = new Map();
      for (const sw of list) { const w = tk(sw.n); const k = (w[w.length - 1] || "").slice(0, 4); if (!byLast.has(k)) byLast.set(k, []); byLast.get(k).push(sw); }
      for (const a of list) {
        if (dropped.has(a)) continue;
        const w = tk(a.n); const k = (w[w.length - 1] || "").slice(0, 4);
        const c = (byLast.get(k) || []).filter((b) => b !== a && !dropped.has(b) && like(a, b) && !(a.m || []).some((x) => (b.m || []).includes(x)));
        if (c.length !== 1) continue;
        const b = c[0];
        const ua = rosterWho.get(rosterKey(a.n)), ub = rosterWho.get(rosterKey(b.n));
        if (ua && ub && rosterKey(a.n) !== rosterKey(b.n)) continue;
        const score = (x) => { const w = tk(x.n); return (rosterWho.has(rosterKey(x.n)) ? 1000 : 0) - (w.slice(0, -1).some((y) => y.length <= 2) ? 300 : 0) + w[0].length * 5 + (x.m?.length || 0) * 2; };
        const [keep, gone] = score(a) >= score(b) ? [a, b] : [b, a];
        if (process.env.VER) console.log("parecido:", keep.n, "<-", gone.n, "·", keep.t, "/", gone.t);
        mergeInto(keep, gone); dropped.add(gone); n3++;
      }
    }
    if (dropped.size) d.swimmers = d.swimmers.filter((s) => !dropped.has(s));
    console.log("nombres cortados, erratas y códigos de equipo, juntados:", n3);
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
  let gRoster = 0;
  for (const sw of d.swimmers) { const t = String(sw.t || ""); const u = alias[t] || alias[t.replace(/-[A-Z]{2}$/, "")]; const g = u && rosterSex.get(rosterKey(sw.n) + "|" + u); if ((g === "M" || g === "W") && sw.g !== g) { sw.g = g; gRoster++; } }
  console.log("sexo corregido:", gFix, "· por la plantilla oficial:", gRoster);
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

// Sexo por el nombre de pila cuando es clarísimo (≥20 nadadores y ≥97 % de un sexo), salvo si la plantilla oficial dice otra cosa.
{
  const f0 = (n) => n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]+/g, " ").trim().split(" ")[0] || "";
  const c = new Map();
  for (const sw of d.swimmers) if (sw.g === "M" || sw.g === "W") { const f = f0(sw.n); if (f.length < 3) continue; const x = c.get(f) || { M: 0, W: 0 }; x[sw.g]++; c.set(f, x); }
  let nf = 0;
  for (const sw of d.swimmers) {
    const x = c.get(f0(sw.n)); if (!x) continue; const t = x.M + x.W, o = sw.g === "M" ? "W" : "M";
    if (t < 20 || x[o] < 0.97 * t) continue;
    const tt = String(sw.t || ""), u = alias[tt] || alias[tt.replace(/-[A-Z]{2}$/, "")];
    if (u && rosterSex.get(rosterKey(sw.n) + "|" + u) === sw.g && t < 40) continue;
    sw.g = o; nf++;
  }
  console.log("sexo corregido por el nombre de pila:", nf);
}
// Nada de Masters (equipos de adultos): fuera del índice y de las mejores marcas.
d.swimmers = d.swimmers.filter((sw) => !/^(masters?|.*\bmasters (swim|team|club)\b.*|usms\b.*|.*\bu\.?s\.? masters\b.*)$/i.test(String(sw.t || "").trim()));
// Tiempos de más de un minuto escritos solo en segundos ("351.83" → "5:51.83").
{
  let nt = 0;
  for (const sw of d.swimmers) for (const v of Object.values(sw.b || {})) { const m = /^(\d{2,3})\.(\d{2})$/.exec(v[0] || ""); if (m && +m[1] >= 60) { v[0] = `${Math.floor(+m[1] / 60)}:${String(+m[1] % 60).padStart(2, "0")}.${m[2]}`; nt++; } }
  console.log("tiempos pasados de segundos a minutos:", nt);
}
// Mejores marcas registradas de cada universidad (para las que no publican récords legibles): la mejor marca de cada prueba
// en los resultados guardados, con nadador y año. Solo marcas de competiciones (no de biografías), con ritmo posible y
// nunca más rápidas que el récord NCAA de su división. La app las enseña como "mejores marcas", no como récord oficial.
{
  const RJ = await readFile("web/data/records.json", "utf8").then(JSON.parse).catch(() => ({}));
  const NC = RJ.ncaa || {}, ORD = (RJ.order || []).filter((e) => !/Relay/.test(e));
  const U = await readFile("web/data/unis.json", "utf8").then(JSON.parse).catch(() => []);
  const UL = U.unis || U;
  const divOf = Object.fromEntries(UL.map((u) => [u.n, u.div]));
  const byName = new Map(); for (const u of UL) for (const k of [u.n, u.full]) if (k) byName.set(k.toLowerCase(), u.n);
  const uniOf = (t0) => { const t = String(t0 || ""), t2 = t.replace(/-[A-Z]{2}$/, ""); return alias[t] || alias[t2] || byName.get(t.toLowerCase()) || byName.get(t2.toLowerCase()); };
  const capOf = (ev) => { const em = /^(\d+) Y (Free|Back|Breast|Fly|IM)$/.exec(ev); return em ? [+em[1], { Free: 0.9, Back: 1.0, Fly: 1.0, Breast: 1.1, IM: 1.0 }[em[2]]] : null; };
  const out = {}, MI = d.mi || {};
  for (const sw of d.swimmers) {
    if (sw.g !== "M" && sw.g !== "W") continue;
    const u = uniOf(sw.t); if (!u) continue;
    const dv = { D2: "D2", D3: "D3" }[divOf[u]];
    for (const [ev, v] of Object.entries(sw.b || {})) {
      if (!ORD.includes(ev) || !v[2]) continue;
      const c = capOf(ev); if (!c) continue;
      const sc = secs(v[0]), pc = sc / c[0];
      if (!(pc >= 0.36 && pc <= c[1])) continue;
      if (sc < secs(NC.D1?.[sw.g]?.[ev]?.t) - 0.01) continue;
      if (dv && sc < secs(NC[dv]?.[sw.g]?.[ev]?.t) * 0.99) continue;
      const g = ((out[u] ||= {})[sw.g] ||= {});
      if (g[ev] && secs(g[ev].t) <= sc) continue;
      const date = (MI[v[2]] && MI[v[2]][1]) || "";
      g[ev] = { t: v[0], n: sw.n, ...(date ? { y: date.slice(0, 4) } : {}), ...(MI[v[2]]?.[0] || v[1] ? { m: (MI[v[2]]?.[0] || v[1]).slice(0, 80) } : {}) };
    }
  }
  // Un sexo con menos de 4 pruebas no se enseña (pocos datos).
  for (const [u, x] of Object.entries(out)) { for (const g of ["M", "W"]) if (x[g] && Object.keys(x[g]).length < 4) delete x[g]; if (!x.M && !x.W) delete out[u]; }
  await writeFile("web/data/records-hist.json", JSON.stringify({ updated: new Date().toISOString().slice(0, 10), u: out }));
  console.log("mejores marcas registradas: universidades", Object.keys(out).length);
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
const fixName = (n0) => { const n = n0.replace(/ϐ/g, "f"); return (n.includes(",") ? n.split(",").map((x) => x.trim()).filter(Boolean).reverse().join(" ") : n).replace(/\s+/g, " ").trim().replace(/\s+[A-Z]\.?(?=\s)/g, ""); };
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
// Sexo de cada prueba comprobado con los nombres de pila (Madison, Michael...) contados en todos los nadadores:
// algunos PDF etiquetan mal la prueba ("Men 100 Yard Freestyle" lleno de nadadoras) o mezclan las dos.
const firstOf = (n) => (fixName(String(n)).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z]+/) || [""])[0];
const fnCount = new Map();
for (const sw of d.swimmers) if (sw.g === "M" || sw.g === "W") { const f = firstOf(sw.n); if (f.length < 3) continue; const c = fnCount.get(f) || { M: 0, W: 0 }; c[sw.g]++; fnCount.set(f, c); }
const sexOf = new Map();
for (const [f, c] of fnCount) { const t = c.M + c.W; if (t >= 8 && Math.max(c.M, c.W) >= 0.92 * t) sexOf.set(f, c.M > c.W ? "M" : "W"); }
let flipped = 0, skipped = 0, dropped = 0;
const realSex = (ev, g) => {
  let ok = 0, bad = 0;
  for (const r of ev.res || []) { const s = r[1] && sexOf.get(firstOf(r[1])); if (s === g) ok++; else if (s) bad++; }
  if (ok + bad < 3 || bad <= ok) return g;
  if (bad >= 3 * ok) { flipped++; return g === "M" ? "W" : "M"; }
  skipped++; return "";
};
for (const f of await readdir("web/data/m").catch(() => [])) {
  let x;
  try { x = JSON.parse(await readFile("web/data/m/" + f, "utf8")); } catch { continue; }
  const S = seasons[which(x.d)];
  if (!S) continue;
  S.meets++;
  for (const ev of x.ev || []) {
    const evn = shortEv(ev.ti || "");
    let g = sexOfT(ev.ti || "");
    if (g && !REL.test(evn)) g = realSex(ev, g);
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
      else if (n && /^[\p{L}][\p{L}'’.,\- ]+$/u.test(n.trim())) {
        const sx = sexOf.get(firstOf(n));
        if (sx && sx !== g) { dropped++; continue; } // nadadora en una prueba de hombres (o al revés): fuera
        put(T0(S, x.ta?.[team] || team)[g], evn, t, fixName(n), g);
      }
    }
  }
}
console.log("pruebas con el sexo cambiado:", flipped, "· dudosas:", skipped, "· tiempos de otro sexo quitados:", dropped);
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
// Mismo nadador escrito de dos maneras dentro de un equipo ("Mario Poulsen" y "Mario Rodriguez Poulsen",
// "Poulsen Mario", "J. Smith" con el mismo tiempo que "Jack Smith"): se juntan en el nombre más largo.
const toks = (n) => n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]+/g, " ").trim().split(/\s+/).filter(Boolean);
const firstOk = (a, b) => a === b || (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) || (a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4));
const sameWho = (a, b, sharedTime) => {
  const A = toks(a), B = toks(b);
  if (A.length < 2 || B.length < 2) return false;
  const sa = [...A].sort().join(" "), sb = [...B].sort().join(" ");
  if (sa === sb) return true;
  const ra = A.slice(1), rb = B.slice(1);
  if (firstOk(A[0], B[0])) {
    if (ra.every((x) => rb.includes(x)) || rb.every((x) => ra.includes(x))) return true;
    if (A.at(-1) === B.at(-1)) return true;
  }
  if (A.at(-1) !== B.at(-1)) return false;
  // Mismo apellido y nombre en forma corta ("Kate"/"Kathryn", "Joey"/"Joseph", "J."/"James") o con una letra perdida al leer el PDF ("So ia"/"Sofia").
  const fa = A.slice(0, -1).join(""), fb = B.slice(0, -1).join("");
  if (fa.length <= 2 || fb.length <= 2) return fa[0] === fb[0];
  if (fa.replace(/f/g, "") === fb.replace(/f/g, "")) return true;
  // Dos personas distintas de la misma plantilla oficial (hermanos): nunca se juntan.
  const ua = rosterWho.get(rosterKey(a)), ub = rosterWho.get(rosterKey(b));
  if (ua && ub && [...ua].some((u) => ub.has(u))) return false;
  if ((NICK.get(A[0]) || []).some((x) => (NICK.get(B[0]) || []).includes(x))) return true;
  if (A[0].slice(0, 3) === B[0].slice(0, 3)) return true;
  if (lev1(A[0], B[0])) return true;
  // Mismo apellido e inicial, y solo uno de los dos está en alguna plantilla: es su nombre corto.
  if (A[0][0] === B[0][0] && (!!ua !== !!ub)) return true;
  // Inicial igual y mismo apellido: solo si comparten algún tiempo exacto (evita juntar hermanos).
  return !!sharedTime && A[0][0] === B[0][0];
};
const lev1 = (a, b) => { if (a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > 1) return false; let i = 0; while (i < a.length && a[i] === b[i]) i++; const x = a.slice(i + 1), y = b.slice(i + 1); return x === y || a.slice(i) === y || x === b.slice(i); };
const dedupeTeam = (T, g) => {
  const names = new Map(); // nombre -> set de "prueba|tiempo"
  for (const [ev, l] of Object.entries(T[g])) for (const [t, who] of l.values()) (names.get(who) || names.set(who, new Set()).get(who)).add(ev + "|" + t);
  for (const l of Object.values(T["R" + g])) for (const [, who] of l.values()) if (Array.isArray(who)) for (const w of who) if (!names.has(w)) names.set(w, new Set());
  const together = new Set();
  for (const l of Object.values(T["R" + g])) for (const [, who] of l.values()) if (Array.isArray(who)) for (const a of who) for (const b of who) if (a !== b) together.add(a + "|" + b);
  const inR = (n) => (rosterWho.has(rosterKey(n)) ? 1 : 0);
  const list = [...names.keys()].sort((a, b) => inR(b) - inR(a) || b.length - a.length || a.localeCompare(b));
  const canon = new Map();
  for (const n of list) {
    if (canon.has(n)) continue;
    canon.set(n, n);
    for (const m of list) {
      if (canon.has(m)) continue;
      const shared = [...names.get(m)].some((x) => names.get(n).has(x));
      if (!together.has(n + "|" + m) && sameWho(n, m, shared)) canon.set(m, n);
    }
  }
  const out = {};
  for (const [ev, l] of Object.entries(T[g])) {
    const nl = new Map();
    for (const [t, who] of l.values()) { const c = canon.get(who) || who, k = whoKey(c), p = nl.get(k); if (!p || secs(t) < secs(p[0])) nl.set(k, [t, c]); }
    out[ev] = nl;
  }
  T[g] = out;
  for (const l of Object.values(T["R" + g])) for (const v of l.values()) if (Array.isArray(v[1])) v[1] = v[1].map((w) => canon.get(w) || w);
};
for (const [sk, S] of Object.entries(seasons)) for (const [k, T] of Object.entries(S.teams)) {
  if (!isUni(T.n)) continue;
  for (const g of ["M", "W"]) dedupeTeam(T, g);
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

