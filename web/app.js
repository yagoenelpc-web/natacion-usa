import { normalizeMeetUrl, parseIndex, parseEvent, parseCatalog, parseFeed, uniqueEvents, isLive, organization, todayUS } from "./parser.js";
import { buildIndex, matchTeam, initials, colorFor, norm, BRAND_PAGES } from "./logos.js";

const SOURCE = "https://swimmeetresults.tech/";
// Catálogos públicos de equipos de ESPN: juntos cubren la NCAA (D-I, D-II, D-III) y la NAIA.
const ESPN = [
  "basketball/mens-college-basketball",
  "basketball/womens-college-basketball",
  "football/college-football",
  "soccer/usa.ncaa.w.1",
  "volleyball/womens-college-volleyball",
  "baseball/college-baseball",
].map((p) => `https://site.api.espn.com/apis/site/v2/sports/${p}/teams?limit=2000`);
const SWIMSWAM = ["https://swimswam.com/feed/", "https://swimswam.com/feed/?paged=2", "https://swimswam.com/feed/?paged=3", "https://swimswam.com/tag/live-results/feed/"];
const ORG = {
  ncaa: { label: "NCAA", short: "NCAA", full: "NCAA" },
  usas: { label: "USA Swimming", short: "USA", full: "USA Swimming" },
  usms: { label: "US Masters", short: "USMS", full: "US Masters Swimming" },
  conf: { label: "Conferencias", short: "🏊", get full() { return T("Conferencias e invitationals"); } },
  dual: { label: "Duales", short: "VS", get full() { return T("Encuentros entre universidades"); } },
};
const SECTION_ES = {
  "Championship Final": "Final A",
  "Consolation Final": "Final B",
  "Bonus Final": "Final C",
  Preliminaries: "Preliminares",
  "Semi-Finals": "Semifinales",
  "Swim-off": "Desempate",
};

const $app = document.getElementById("app");

// ---------- idioma ----------
const EN = {
  "Aún no tiene marcas en los resultados guardados de esta temporada.": "No times yet in this season's saved results.", "En la plantilla oficial de su universidad": "On their school's official roster",
  "Calendario y resultados": "Schedule and results", "próximamente": "upcoming", "Y {n} más en la ficha de cada universidad.": "And {n} more on each school's page.",
  "Encuentros entre universidades": "Dual meets", "Ranking NCAA": "NCAA ranking", "Ranking: puesto en los últimos campeonatos NCAA/NAIA (♂ chicos, ♀ chicas).": "Ranking: place at the last NCAA/NAIA championships (♂ men, ♀ women).",
  "Datos de Wikipedia (CC BY-SA), Wikidata y webs oficiales.": "Data from Wikipedia (CC BY-SA), Wikidata and official sites.", "No puntuó": "Did not score", "Solo se publican campeón y subcampeón": "Only champion and runner-up are published", "de {n}": "of {n}",
  "Entrenador principal": "Head coach", "Entrenador (mujeres)": "Women's head coach", "Esta universidad no publica su equipo técnico en un formato que se pueda leer.": "This school doesn't publish its staff in a readable format.",
  "Ver en su web": "See their site", "1º año": "Freshman", "2º año": "Sophomore", "3º año": "Junior", "4º año": "Senior", "Posgrado": "Graduate", "5º año": "5th year",
  "Aún no hay nadadores de esta universidad en los resultados guardados de esta temporada.": "No swimmers from this school in this season's saved results yet.",
  "Últimos campeonatos nacionales": "Last national championships", "Correo de la universidad": "University email", "Su última competición en casa": "Their latest home meet",
  "Equipo técnico y contacto": "Staff and contact", "Nadadores": "Swimmers", "Web de la universidad": "University site", "Equipo técnico (mujeres)": "Women's staff",
  "Plantilla oficial": "Official roster", "Plantilla oficial (mujeres)": "Women's official roster",
  "Nadadores sacados de los resultados públicos de esta temporada y de los últimos NCAA. Datos de Wikipedia (CC BY-SA), Wikidata y la web oficial de la universidad.": "Swimmers taken from this season's public results and the last NCAA championships. Data from Wikipedia (CC BY-SA), Wikidata and the school's official site.",
  "Cargando nadadores…": "Loading swimmers…", "Nadadores de universidades de EE. UU. que aparecen en los resultados de esta temporada y de los últimos NCAA.": "US college swimmers found in this season's results and the last NCAA championships.",
  "Buscar nadador o universidad": "Search swimmer or school", "nadadores": "swimmers", "actualizado": "updated", "Escribe un nombre (por ejemplo «Gemmell») o una universidad.": "Type a name (e.g. “Gemmell”) or a school.",
  "No hay nadadores con ese nombre en los resultados guardados.": "No swimmers with that name in the saved results.", "Nadador no encontrado.": "Swimmer not found.",
  "Mejores marcas": "Best times", "Competiciones": "Meets", "Ver universidad": "See school", "Marcas oficiosas de los resultados públicos (Y = yardas, M = metros).": "Unofficial times from public results (Y = yards, M = meters).",
  "Conferencias e invitationals": "Conferences & invitationals",
  "Buscando campeonatos…": "Finding meets…",
  "Cargando…": "Loading…",
  "Reintentar": "Retry",
  "No se pudo cargar la lista de campeonatos. Comprueba la conexión.": "Couldn't load the meet list. Check your connection.",
  "Resultados de NCAA, USA Swimming y campeonatos de EE. UU.": "NCAA, USA Swimming and US meet results.",
  "En directo": "Live now",
  "EN DIRECTO": "LIVE",
  "Ahora mismo no hay ningún campeonato en directo.": "No meets are live right now.",
  "El próximo es": "Next up is",
  "mañana": "tomorrow",
  "dentro de {n} días": "in {n} days",
  "en {n} días": "in {n} days",
  "Mis universidades": "My universities",
  "Próximamente": "Coming up",
  "Anunciados, aún sin resultados": "Announced, no results yet",
  "Temporada {y} · resultados aún no publicados": "{y} season · results not published yet",
  "pruebas": "events",
  "No se pudo abrir este campeonato.": "Couldn't open this meet.",
  "Pruebas": "Events",
  "Clasificación": "Standings",
  "Universidades": "Universities",
  "Campeonatos": "Meets",
  "Ajustes": "Settings",
  "Sesión": "Session",
  "Relevo": "Relay",
  "Todavía no hay pruebas publicadas.": "No events published yet.",
  "Tras la prueba {n}": "After event {n}",
  "La clasificación aparecerá cuando haya pruebas puntuables terminadas.": "Standings will appear once scored events finish.",
  "Universidades vistas en las últimas pruebas": "Universities seen in recent events",
  "La lista de universidades aparecerá cuando haya resultados.": "The university list will appear once there are results.",
  "Lidera {t} con {p} pts": "{t} leads with {p} pts",
  "Crónica en SwimSwam": "SwimSwam recap",
  "Última prueba terminada": "Latest finished event",
  "Inicio": "Home",
  "Volver": "Back",
  "Sin parciales": "No splits",
  "Ver todo de {t}": "All results for {t}",
  "Esta prueba todavía no tiene resultados. Se comprobará de nuevo cada minuto.": "No results for this event yet. Checking again every minute.",
  "Solo mis universidades": "Only my universities",
  "Récords": "Records",
  "Sin resultados todavía.": "No results yet.",
  "Clasificación por equipos": "Team standings",
  "Ver clasificación completa": "Full standings",
  "Buscando resultados de {t}…": "Finding results for {t}…",
  "podios": "podiums",
  "puntos": "points",
  "No hay campeonatos con resultados ahora mismo.": "No meets with results right now.",
  "Buscar universidad": "Search university",
  "Todas": "All", "Hombres": "Men", "Mujeres": "Women", "Saltos": "Diving", "Todos": "All",
  "Conferencia": "Conference", "Estado": "State", "Equipos": "Teams", "Filtros": "Filters",
  "universidades": "universities", "Ninguna universidad con estos filtros.": "No universities match these filters.",
  "Marca con ★ las tuyas: aparecerán en la portada y podrás filtrar los resultados.": "Star ★ yours: they'll show on the home screen and you can filter results.",
  "Entrenador": "Head coach", "Entrenador (hombres)": "Men's head coach", "Entrenadora/entrenador (mujeres)": "Women's head coach",
  "No disponible": "Not available", "Equipo técnico": "Coaching staff", "Ver en la web oficial": "See official site", "Ciudad": "City", "División": "Division", "Apodo": "Nickname",
  "Ver sus resultados": "See their results", "Wikipedia": "Wikipedia", "Web oficial": "Official site",
  "Datos de Wikipedia (CC BY-SA).": "Data from Wikipedia (CC BY-SA).",
  "Idioma": "Language", "Tema": "Theme", "Automático": "Automatic", "Claro": "Light", "Oscuro": "Dark", "Fondo": "Background",
  "Océano": "Ocean", "Atardecer": "Sunset", "Bosque": "Forest", "Lavanda": "Lavender", "Grafito": "Graphite",
  "Borrar datos guardados": "Clear saved data", "Datos guardados borrados.": "Saved data cleared.",
  "Acerca de": "About", "Universidad no encontrada.": "University not found.",
  "Final A": "A Final", "Final B": "B Final", "Final C": "C Final", "Preliminares": "Prelims", "Semifinales": "Semifinals", "Desempate": "Swim-off",
};
const lang = () => (store.get("lang", (navigator.language || "es").toLowerCase().startsWith("es") ? "es" : "en") === "en" ? "en" : "es");
function T(s, vars) {
  let out = lang() === "en" && EN[s] ? EN[s] : s;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, v);
  return out;
}
const mem = new Map();
let refreshTimer = null;
let logoIndex = null;
let brands = {};

// ---------- almacenamiento local seguro ----------
const store = {
  get(k, fallback) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};
const favs = () => new Set(store.get("favs", []));
// Dos nombres son la misma universidad si coinciden o comparten escudo ("Arizona St" y "Arizona State").
function sameTeam(a, b) {
  if (!a || !b) return false;
  if (a.toLowerCase() === b.toLowerCase()) return true;
  if (!logoIndex) return false;
  const x = matchTeam(logoIndex, a);
  const y = matchTeam(logoIndex, b);
  return !!(x && y && x.logo === y.logo);
}
const isFav = (team, f = favs()) => [...f].some((t) => sameTeam(t, team));
function toggleFav(team) {
  const f = favs();
  f.has(team) ? f.delete(team) : f.add(team);
  store.set("favs", [...f]);
}

// ---------- red ----------
async function api(url, ttl = 60) {
  const hit = mem.get(url);
  if (hit && Date.now() - hit.t < ttl * 1000) return hit.v;
  const disk = store.get("c:" + url);
  if (disk && Date.now() - disk.t < ttl * 1000) {
    mem.set(url, disk);
    return disk.v;
  }
  let res;
  for (let i = 0; i < 3; i++) {
    try {
      res = await fetch("/api/fuente?url=" + encodeURIComponent(url));
      if (res.ok || res.status === 404 || res.status === 403 || res.status === 415) break;
    } catch (e) {
      if (i === 2) throw e;
    }
    await new Promise((r) => setTimeout(r, 700 * (i + 1)));
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const v = await res.text();
  const entry = { t: Date.now(), v };
  mem.set(url, entry);
  if (ttl >= 3600 && v.length < 400000) store.set("c:" + url, entry);
  return v;
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        try {
          out[k] = await fn(items[k]);
        } catch (e) {
          out[k] = null;
        }
      }
    })
  );
  return out;
}

// ---------- datos ----------
const meetIdFromUrl = (url) => new URL(url).pathname.split("/").filter((p) => p && !/\.html?$/i.test(p)).pop();
const meetUrlFromId = (id) => normalizeMeetUrl(/^https?:\/\//i.test(id) ? id : SOURCE + id);
const eventKey = (url) => url.split("/").pop().replace(/\.html?$/i, "");

async function loadLogos() {
  await loadUnis();
  if (logoIndex) return logoIndex;
  const cached = store.get("logos2");
  if (cached && Date.now() - cached.t < 7 * 864e5) {
    logoIndex = cached.v;
  } else {
    const payloads = await Promise.all(ESPN.map((u) => api(u, 86400).then(JSON.parse).catch(() => null)));
    logoIndex = buildIndex(payloads.filter(Boolean));
    if (Object.keys(logoIndex).length) store.set("logos2", { t: Date.now(), v: logoIndex });
  }
  return logoIndex;
}

async function loadBrands() {
  const cached = store.get("brands");
  if (cached && Date.now() - cached.t < 30 * 864e5 && Object.keys(cached.v).length) return (brands = cached.v);
  const entries = await Promise.all(
    Object.entries(BRAND_PAGES).map(async ([k, page]) => {
      try {
        const d = JSON.parse(await api(`https://en.wikipedia.org/api/rest_v1/page/summary/${page}`, 86400));
        return [k, (d.thumbnail || d.originalimage || {}).source];
      } catch {
        return [k, null];
      }
    })
  );
  brands = Object.fromEntries(entries.filter(([, v]) => v));
  store.set("brands", { t: Date.now(), v: brands });
  return brands;
}

// Universidades con natación (web/data/unis.json, generado desde Wikipedia).
let unis = null;
let uniIndex = null;
async function loadUnis() {
  if (unis) return unis;
  try {
    unis = (await loadData("unis"))?.unis || [];
  } catch {
    unis = [];
  }
  uniIndex = {};
  for (const u of unis) {
    const info = { logo: u.logo || u.seal || "", color: "#0b63ce", display: u.n, uni: u };
    for (const k of [u.n, u.full, `${u.n} ${u.nick || ""}`, u.nick && u.full ? null : null]) if (k && !(norm(k) in uniIndex)) uniIndex[norm(k)] = info;
  }
  return unis;
}
const findUni = (name) => {
  if (!uniIndex || !name) return null;
  const direct = matchTeam(uniIndex, name)?.uni;
  if (direct) return direct;
  const e = logoIndex ? matchTeam(logoIndex, name) : null;
  return e ? matchTeam(uniIndex, e.display)?.uni || null : null;
};

// Datos que GitHub actualiza solos: archivo de competiciones, ranking NCAA y nadadores.
// Los datos viven en la rama "datos" de GitHub (se actualizan sin volver a publicar la web); si falla, copia local.
const DATA_REMOTE = "https://raw.githubusercontent.com/yagoenelpc-web/natacion-usa/datos/web/data/";
const jsonCache = {};
function loadData(name) {
  return (jsonCache[name] ||= (async () => {
    for (const base of [DATA_REMOTE, "/data/"]) {
      try {
        const r = await fetch(`${base}${name}.json`, { cache: "no-cache" });
        if (r.ok) return await r.json();
      } catch {}
    }
    return null;
  })());
}
let rankMap = null;
async function loadRanks() {
  if (rankMap) return rankMap;
  await loadLogos().catch(() => {});
  const d = (await loadData("ncaa")) || { divisions: {} };
  rankMap = new Map();
  rankMap.partial = new Set(Object.entries(d.divisions || {}).flatMap(([div, v]) => Object.entries(v).filter(([, x]) => x.partial).map(([g]) => div + g)));
  for (const [div, bySex] of Object.entries(d.divisions || {}))
    for (const [g, x] of Object.entries(bySex))
      for (const t of x.teams) {
        const u = findUni(t.t);
        if (!u) continue;
        const r = rankMap.get(u) || {};
        if (!r[g] || (div === u.div && r[g].div !== u.div)) r[g] = { p: t.p, pts: t.pts, year: x.year, div, of: x.partial ? 0 : x.teams.length };
        rankMap.set(u, r);
      }
  return rankMap;
}
const bestRank = (r) => Math.min(r?.M?.p ?? Infinity, r?.W?.p ?? Infinity);
let swimmers = null;
async function loadSwimmers() {
  if (swimmers) return swimmers;
  await loadLogos().catch(() => {});
  const [d, pl] = await Promise.all([loadData("nadadores"), loadData("plantillas")]);
  const secs = (t) => { const m = /^(?:(\d+):)?(\d+\.\d+)/.exec(t || ""); return m ? (+m[1] || 0) * 60 + +m[2] : Infinity; };
  const merged = new Map();
  for (const x of d?.swimmers || []) {
    const n = x.n.trim();
    if (n.split(/\s+/).length < 2) continue;
    const u = findUni(x.t);
    const k = n.toLowerCase() + "|" + (u ? u.n : x.t.toLowerCase());
    const prev = merged.get(k);
    if (!prev) {
      merged.set(k, { ...x, n, u, b: { ...x.b }, m: [...x.m] });
      continue;
    }
    prev.y ||= x.y;
    prev.g ||= x.g;
    for (const [ev, v] of Object.entries(x.b)) if (!prev.b[ev] || secs(v[0]) < secs(prev.b[ev][0])) prev.b[ev] = v;
    for (const m of x.m) if (!prev.m.includes(m)) prev.m.push(m);
  }
  // Plantillas oficiales: completan nombres cortados por los resultados ("Alvar Zornoza Quiros" → "Alvaro Zornoza Quiros")
  // y añaden a los nadadores que aún no han competido.
  const low = (t) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const byUni = new Map();
  for (const [name, p] of Object.entries(pl?.plant || {})) {
    const u = unis.find((x) => x.n === name);
    if (!u) continue;
    const list = [];
    for (const [g, names] of Object.entries(p)) for (const full of names) {
      const tk = full.trim().split(/\s+/);
      list.push({ full, first: tk[0], last: tk.slice(1).join(" "), g: g === "X" ? "" : g, used: false });
    }
    byUni.set(u, list);
  }
  for (const x of merged.values()) {
    const ro = x.u && byUni.get(x.u);
    if (!ro) continue;
    const last = x.l || x.n.split(/\s+/).slice(1).join(" ");
    const first = x.l ? x.n.slice(0, x.n.length - x.l.length).trim() : x.n.split(/\s+/)[0];
    const lt = low(last).split(/[\s-]+/)[0];
    const f = low(first);
    const r = ro.find((r) => !r.used && low(r.last).split(/[\s-]+/)[0] === lt && (low(r.first).startsWith(f) || f.startsWith(low(r.first))));
    if (!r) continue;
    r.used = true;
    const fn = r.first.length > first.length ? r.first : first;
    const ln = r.last.length > last.length ? r.last : last;
    x.n = `${fn} ${ln}`;
    x.g ||= r.g;
    x.ro = true;
  }
  for (const [u, ro] of byUni) for (const r of ro) if (!r.used) merged.set("ro|" + u.n + "|" + r.full, { n: r.full, t: u.n, u, g: r.g, b: {}, m: [], ro: true });
  swimmers = [...merged.values()].sort((a, b) => a.n.localeCompare(b.n)).map((x, i) => ({ ...x, i }));
  swimmers.updated = d?.updated || "";
  return swimmers;
}
const isDual = (name) => /\bvs\.?\s|\bv\.\s|\bdual\b|tri[- ]?meet|quad[- ]?meet/i.test(name);
async function loadArchive() {
  const d = await loadData("archivo");
  const today = todayUS();
  const latest = new Map();
  for (const m of d?.meets || []) {
    const base = m.url.split("#")[0];
    const prev = latest.get(base);
    if (!prev || (m.start || "") > (prev.start || "")) latest.set(base, m);
  }
  return [...latest.values()].map((m) => ({
    id: m.url.split("#")[0],
    name: m.name,
    org: isDual(m.name) ? "dual" : m.org || organization(m.name),
    start: m.start || null,
    end: m.end || m.start || null,
    status: m.start && m.start > today ? "upcoming" : m.start && (m.end || m.start) >= today ? "live" : "done",
    events: m.events,
    article: m.article,
    via: m.src,
  }));
}

async function loadMeetIndex(id) {
  const url = meetUrlFromId(id);
  const known = store.get("m:" + id);
  const ttl = known && known.status === "done" ? 6 * 3600 : 60;
  const meet = parseIndex(await api(url, ttl), url);
  meet.id = id;
  meet.org = organization(meet.name);
  meet.status = statusOf(meet);
  store.set("m:" + id, { status: meet.status });
  return meet;
}

function statusOf(meet) {
  const today = todayUS();
  if (isLive(meet, today)) return "live";
  if (meet.start && meet.start > today) return "upcoming";
  return "done";
}

async function loadSummaries() {
  const year = +todayUS().slice(0, 4);
  const years = new Set([year - 1, year, year + 1].map(String));
  const catalog = parseCatalog(await api(SOURCE, 3600), SOURCE).filter((m) => years.has(m.year));
  const metas = await pool(catalog, 4, async (c) => {
    const id = meetIdFromUrl(c.url);
    const cached = store.get("s:" + id);
    if (cached && cached.status === "done" && Date.now() - cached.t < 7 * 864e5) return cached;
    if (cached && cached.pending && Date.now() - cached.t < 864e5) return cached;
    let m;
    try {
      m = await loadMeetIndex(id);
    } catch {
      // Aún sin página de resultados: campeonato futuro anunciado en el catálogo.
      if (+c.year < year) return null;
      const s = { id, name: c.name.replace(/-/g, " "), org: organization(c.name), start: null, end: null, status: "upcoming", events: 0, pending: true, t: Date.now() };
      store.set("s:" + id, s);
      return s;
    }
    const s = { id, name: m.name || c.name, org: organization(m.name + " " + c.name), start: m.start, end: m.end, status: m.status, events: uniqueEvents(m).length, t: Date.now() };
    store.set("s:" + id, s);
    return s;
  });
  return metas.filter(Boolean);
}

// Competiciones que SwimSwam enlaza en su canal RSS (invitationals, duales…).
async function loadSwimSwam() {
  const feeds = await Promise.all(SWIMSWAM.map((u) => api(u, 600).catch(() => "")));
  const seen = new Map();
  for (const m of feeds.flatMap((x) => (x ? parseFeed(x) : []))) if (!seen.has(m.url)) seen.set(m.url, m);
  const recent = [...seen.values()].filter((m) => Date.now() - m.date < 7 * 864e5);
  const metas = await pool(recent, 4, async (f) => {
    const id = f.url;
    const cached = store.get("s:" + id);
    if (cached && cached.status === "done" && Date.now() - cached.t < 864e5) return cached;
    const m = await loadMeetIndex(id);
    if (!uniqueEvents(m).length) return null;
    let status = m.status;
    if (!m.start) status = Date.now() - f.date < 36 * 3600e3 ? "live" : "done";
    const s = { id, name: m.name || f.name, org: organization(m.name || f.name), start: m.start, end: m.end, status, events: uniqueEvents(m).length, article: f.article, via: "swimswam", t: Date.now() };
    store.set("s:" + id, s);
    return s;
  });
  return metas.filter(Boolean);
}

async function loadAllMeets() {
  const [cat, ss, arch] = await Promise.all([loadSummaries(), loadSwimSwam().catch(() => []), loadArchive().catch(() => [])]);
  const out = [...cat];
  const names = new Set(cat.map((s) => s.name.toLowerCase().trim()));
  const ids = new Set(cat.map((s) => s.id));
  for (const s of [...ss, ...arch]) {
    const k = s.name.toLowerCase().trim();
    if (names.has(k) || ids.has(s.id)) continue;
    if (isDual(s.name)) s.org = "dual";
    names.add(k);
    ids.add(s.id);
    out.push(s);
  }
  return out;
}

function rememberTeams(ev) {
  if (!logoIndex) return;
  const seen = new Set(store.get("seenTeams", []));
  const before = seen.size;
  for (const t of [...ev.results.map((r) => r.t), ...ev.scores.map((s) => s.t)]) if (t && !matchTeam(logoIndex, t)) seen.add(t);
  if (seen.size !== before) store.set("seenTeams", [...seen].slice(-1500));
}

async function loadEvent(url, live, hops = 0) {
  const html = await api(url, live ? 45 : 6 * 3600);
  let ev = parseEvent(html, url);
  if (!ev.title && hops < 2) {
    // "Última prueba" a veces es una página que redirige (meta refresh, marco o script).
    const m = /http-equiv=["']?refresh["']?[^>]*url=([^"'>\s]+)/i.exec(html) || /<i?frame[^>]+src=["']?([^"'>\s]+)/i.exec(html) || /location(?:\.href)?\s*=\s*["']([^"']+)/i.exec(html);
    if (m) return loadEvent(new URL(m[1], url).href, live, hops + 1);
  }
  rememberTeams(ev);
  return ev;
}

// ---------- utilidades de vista ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const enc = encodeURIComponent;
const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS = new Proxy([], { get: (_, k) => (lang() === "en" ? MONTHS_EN : MONTHS_ES)[k] });
function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
function fmtRange(a, b) {
  if (!a) return "";
  if (!b || a === b) return fmtDate(a);
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  if (ya === yb && ma === mb) return `${da}–${db} ${MONTHS[mb - 1]} ${yb}`;
  return `${fmtDate(a)} – ${fmtDate(b)}`;
}
const DAYS = { Monday: "Lunes", Tuesday: "Martes", Wednesday: "Miércoles", Thursday: "Jueves", Friday: "Viernes", Saturday: "Sábado", Sunday: "Domingo" };
function fmtDay(text) {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text || "");
  const wd = Object.keys(DAYS).find((d) => (text || "").includes(d));
  if (!m) return text || "";
  return `${wd ? (lang() === "en" ? wd : DAYS[wd]) + " " : ""}${+m[2]} ${MONTHS[+m[1] - 1]}`;
}
function daysUntil(iso) {
  const ms = Date.parse(iso + "T12:00:00Z") - Date.parse(todayUS() + "T12:00:00Z");
  return Math.round(ms / 864e5);
}
function englishToSpanish(name) {
  if (lang() === "en") return name.replace(/\s+/g, " ").trim();
  return name
    .replace(/\bMen\b/g, "Hombres")
    .replace(/\bWomen\b/g, "Mujeres")
    .replace(/\bMixed\b/g, "Mixto")
    .replace(/\bYard\b/g, "yardas")
    .replace(/\bMeter\b/g, "metros")
    .replace(/\bFreestyle Relay\b|\bFree Relay\b/g, "Relevo libre")
    .replace(/\bMedley Relay\b/g, "Relevo estilos")
    .replace(/\bFreestyle\b|\bFree\b/g, "Libre")
    .replace(/\bBackstroke\b|\bBack\b/g, "Espalda")
    .replace(/\bBreaststroke\b|\bBreast\b/g, "Braza")
    .replace(/\bButterfly\b|\bFly\b/g, "Mariposa")
    .replace(/\bIndividual Medley\b|\bIM\b/g, "Estilos")
    .replace(/\bPlatform Diving\b/g, "Saltos plataforma")
    .replace(/(\d) mtr Diving\b/g, "Saltos $1 m")
    .replace(/\bDiving\b/g, "Saltos")
    .replace(/\bPrelims\b/g, "· Preliminares")
    .replace(/\bFinals\b/g, "· Final")
    .replace(/\s+/g, " ")
    .trim();
}

function crest(team, size = 32) {
  let info = logoIndex ? matchTeam(logoIndex, team) : null;
  if (!(info && info.logo) && uniIndex) {
    const u = matchTeam(uniIndex, team);
    if (u && u.logo) info = { ...u, color: info ? info.color : u.color };
  }
  if (info && info.logo) return `<img class="crest" src="${esc(info.logo)}" alt="" width="${size}" height="${size}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'crest badge',textContent:'${esc(initials(team))}'}))">`;
  return `<span class="crest badge" style="--c:${info ? info.color : colorFor(team)};width:${size}px;height:${size}px">${esc(initials(team))}</span>`;
}
function orgLogo(org, size = 36) {
  const src = brands[org];
  if (src) return `<span class="org" style="width:${size}px;height:${size}px"><img src="${esc(src)}" alt="${esc(ORG[org].label)}"></span>`;
  return `<span class="org org-txt" style="width:${size}px;height:${size}px">${esc((ORG[org] || ORG.conf).short)}</span>`;
}
const star = (team) => `<button class="star ${favs().has(team) ? "on" : ""}" data-fav="${esc(team)}" aria-label="Favorita">${favs().has(team) ? "★" : "☆"}</button>`;
const liveTag = () => `<span class="livetag"><i></i>${T("EN DIRECTO")}</span>`;

function setTitle(t) {
  document.title = t ? `${t} · ${lang() === "en" ? "Swim USA" : "Natación USA"}` : lang() === "en" ? "Swim USA" : "Natación USA";
}
function loading(msg = "Cargando…") {
  $app.innerHTML = `<div class="loading"><div class="spinner"></div><p>${esc(T(msg))}</p></div>`;
}
function errorView(msg) {
  $app.innerHTML = `<div class="empty"><p>${esc(T(msg))}</p><button class="btn" onclick="location.reload()">${T("Reintentar")}</button></div>`;
}
function scheduleRefresh(fn) {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (document.visibilityState === "visible") fn(true);
  }, 60000);
}
function setTab(name) {
  document.querySelectorAll(".tabbar a").forEach((a) => a.classList.toggle("on", a.dataset.tab === name));
}

// ---------- vistas ----------
function meetCard(s) {
  let when = s.pending ? `${T("Temporada {y} · resultados aún no publicados", { y: s.id.match(/(19|20)\d{2}/)?.[0] || "" })}` : fmtRange(s.start, s.end);
  if (s.status === "upcoming" && s.start) {
    const d = daysUntil(s.start);
    when += d === 1 ? ` · ${T("mañana")}` : ` · ${T("en {n} días", { n: d })}`;
  }
  if (s.pending) return `<div class="mcard upcoming pending">${orgLogo(s.org)}<div class="mbody"><strong>${esc(s.name)}</strong><span class="sub">${esc(when)}</span></div></div>`;
  return `<a class="mcard ${s.status}" href="#/m/${enc(s.id)}">
    ${meetBadge(s)}
    <div class="mbody">
      ${s.status === "live" ? liveTag() : ""}
      <strong>${esc(s.name)}</strong>
      <span class="sub">${esc(when)}${s.events ? ` · ${s.events} ${T("pruebas")}` : ""}</span>
    </div><span class="chev">›</span></a>`;
}

async function homeView() {
  setTab("home");
  setTitle("");
  loading("Buscando campeonatos…");
  await Promise.all([loadBrands().catch(() => {}), loadLogos().catch(() => {})]);
  let list;
  try {
    list = await loadAllMeets();
  } catch (e) {
    return errorView("No se pudo cargar la lista de campeonatos. Comprueba la conexión.");
  }
  const live = list.filter((s) => s.status === "live");
  const upcoming = list.filter((s) => s.status === "upcoming").sort((a, b) => (a.start || "9999").localeCompare(b.start || "9999"));
  const next = upcoming.find((s) => s.start);
  const done = list.filter((s) => s.status === "done").sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  const f = [...favs()];
  const byOrg = {};
  for (const s of done) (byOrg[s.org] ||= []).push(s);

  $app.innerHTML = `
  <section class="hero">
    <div class="brands">${["ncaa", "usas", "usms"].map((o) => orgLogo(o, 44)).join("")}</div>
    <h1>${lang() === "en" ? "Swim USA" : "Natación USA"}</h1>
    <p>${T("Resultados de NCAA, USA Swimming y campeonatos de EE. UU.")}</p>
  </section>
  <section>
    <h2>${T("En directo")}</h2>
    ${live.length ? live.map(meetCard).join("") : `<div class="card muted">${T("Ahora mismo no hay ningún campeonato en directo.")}${next ? ` ${T("El próximo es")} <a href="#/m/${enc(next.id)}">${esc(next.name)}</a>, ${daysUntil(next.start) === 1 ? T("mañana") : T("dentro de {n} días", { n: daysUntil(next.start) })}.` : ""}</div>`}
  </section>
  <div id="duals"></div>
  ${f.length ? `<section><h2>${T("Mis universidades")}</h2><div class="chips">${f.map((t) => `<a class="chip" href="#/u/${enc(t)}">${crest(t, 22)}${esc(t)}</a>`).join("")}</div></section>` : ""}
  ${upcoming.length ? `<section><h2>${T("Próximamente")}</h2>${upcoming.filter((s) => !s.pending).map(meetCard).join("")}${
    upcoming.some((s) => s.pending) ? `<details class="announced"><summary>${T("Anunciados, aún sin resultados")} (${upcoming.filter((s) => s.pending).length})</summary>${upcoming.filter((s) => s.pending).map(meetCard).join("")}</details>` : ""
  }</section>` : ""}
  ${Object.keys(ORG).filter((o) => byOrg[o]).map((o) => `<section><h2 class="orgh">${o === "conf" ? "" : orgLogo(o, 26)} ${esc(ORG[o].full)}</h2>${byOrg[o].map(meetCard).join("")}</section>`).join("")}
  <p class="foot">${lang() === "en" ? `Dual meets and calendars from each school's official site. Data from public HY-TEK results pages. Live meets also found via the <a href="https://swimswam.com" target="_blank" rel="noopener">SwimSwam</a> RSS feed. Times are unofficial until published as official.` : `Duales y calendarios de la web oficial de cada universidad. Datos de las páginas públicas de resultados HY-TEK. Competiciones en directo encontradas también gracias al canal RSS de <a href="https://swimswam.com" target="_blank" rel="noopener">SwimSwam</a>. Los tiempos son oficiosos hasta su publicación oficial.`}</p>`;
  dualsSection().then((h) => { const el = document.getElementById("duals"); if (el) el.outerHTML = h; }).catch(() => {});
}

// Universidad anfitriona a partir del nombre ("2026 Tennessee Invitational" → Tennessee).
function hostOf(name) {
  if (!logoIndex || !name) return null;
  const words = name.replace(/\b(19|20)\d{2}\b/g, " ").replace(/[^\w&'(). -]/g, " ").split(/\s+/).filter(Boolean);
  for (let n = Math.min(4, words.length); n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const cand = words.slice(i, i + n).join(" ");
      if (cand.length < 3 || /^(the|of|and|invite|invitational|fall|winter|men'?s|women'?s|swimming|diving|championships?|meet|open|day)$/i.test(cand)) continue;
      const info = matchTeam(logoIndex, cand);
      if (info && info.logo) return { team: cand, info };
    }
  }
  return null;
}
function meetBadge(s, size = 36) {
  if (s.org === "conf") {
    const h = hostOf(s.name);
    if (h) return `<span class="org host" style="width:${size}px;height:${size}px;--hc:${h.info.color}"><img src="${esc(h.info.logo)}" alt=""></span>`;
  }
  return orgLogo(s.org, size);
}

async function findStandings(meet, live) {
  const teams = new Set();
  const take = (ev) => ev.results.forEach((r) => r.t && teams.add(r.t));
  if (meet.lastEventUrl) {
    try {
      const last = await loadEvent(meet.lastEventUrl, live);
      take(last);
      if (last.scores.length) return { standings: last, teams: last.scores.map((s) => s.t) };
    } catch {}
  }
  // Busca hacia atrás, de 6 en 6, la última prueba con clasificación.
  const evs = uniqueEvents(meet).sort((a, b) => b.number - a.number).slice(0, 60);
  for (let i = 0; i < evs.length; i += 6) {
    const got = (await pool(evs.slice(i, i + 6), 6, (e) => loadEvent(e.url, live))).filter((ev) => ev && ev.results.length);
    got.forEach(take);
    const best = got.filter((ev) => ev.scores.length).sort((a, b) => (b.number ?? 0) - (a.number ?? 0))[0];
    if (best) return { standings: best, teams: best.scores.map((s) => s.t) };
    if (got.length) break;
  }
  // Sin clasificación publicada: universidades vistas en las últimas pruebas.
  return { standings: null, teams: [...teams].filter((t) => !/^(unattached|unat)$/i.test(t)).sort() };
}

function podium(scores, id) {
  const top = scores.slice(0, 3);
  if (top.length < 2) return "";
  const order = [top[1], top[0], top[2]].filter(Boolean);
  return `<div class="podium">${order
    .map((t) => `<a class="pod p${t.p}" href="#/m/${enc(id)}/t/${enc(t.t)}">${crest(t.t, t.p == 1 ? 64 : 48)}<strong>${esc(t.t)}</strong><span>${esc(t.pts)} pts</span><i>${t.p}</i></a>`)
    .join("")}</div>`;
}

async function meetView(id, tab = "pruebas", silent = false) {
  setTab("home");
  if (!silent) loading();
  await Promise.all([loadBrands().catch(() => {}), loadLogos().catch(() => {})]);
  let meet;
  try {
    meet = await loadMeetIndex(id);
  } catch {
    return errorView("No se pudo abrir este campeonato.");
  }
  setTitle(meet.name);
  const live = meet.status === "live";
  const { standings, teams } = await findStandings(meet, live);
  const host = meet.org === "conf" ? hostOf(meet.name) : null;
  const tint = host ? host.info.color : { ncaa: "#0a5bb5", usas: "#b3123a", usms: "#11306b" }[meet.org] || "#0b3d91";

  const tabs = [["pruebas", T("Pruebas")], ["clasificacion", T("Clasificación")], ["equipos", T("Universidades")]];
  let body = "";
  if (tab === "pruebas") {
    body = meet.sessions
      .map(
        (s) => `<div class="session"><h3>${esc(s.title.replace("Session", T("Sesión")))}<span>${esc(fmtDay(s.day))}</span></h3>
        ${s.events.map((e) => `<a class="erow" data-ev="${esc(e.url)}" href="#/m/${enc(id)}/e/${enc(eventKey(e.url))}"><span class="num">${e.number}</span><span class="ename">${esc(englishToSpanish(e.name))}<small class="win"></small></span>${e.relay ? `<span class="tag">${T("Relevo")}</span>` : ""}<span class="chev">›</span></a>`).join("")}
      </div>`
      )
      .join("") || `<div class="card muted">${T("Todavía no hay pruebas publicadas.")}</div>`;
  } else if (tab === "clasificacion") {
    body = standings
      ? `${podium(standings.scores, id)}<p class="sub pad">${T("Tras la prueba {n}", { n: standings.number })}</p><div class="list">${standings.scores
          .map((s) => `<a class="srow" href="#/m/${enc(id)}/t/${enc(s.t)}"><span class="place p${s.p}">${s.p}</span>${crest(s.t, 36)}<span class="sname">${esc(s.t)}</span><span class="pts">${esc(s.pts)}<small> pts</small></span></a>`)
          .join("")}</div>`
      : `<div class="card muted">${T("La clasificación aparecerá cuando haya pruebas puntuables terminadas.")}</div>`;
  } else {
    body = teams.length
      ? `${standings ? "" : `<p class="sub pad">${T("Universidades vistas en las últimas pruebas")}</p>`}<div class="grid">${teams.map((t) => `<a class="tcard" href="#/m/${enc(id)}/t/${enc(t)}">${crest(t, 56)}<span>${esc(t)}</span></a>`).join("")}</div>`
      : `<div class="card muted">${T("La lista de universidades aparecerá cuando haya resultados.")}</div>`;
  }

  $app.innerHTML = `
  <a class="back" href="#/">‹ ${T("Inicio")}</a>
  <section class="mhero" style="--tint:${tint}">
    <div class="mtop">${meetBadge({ org: meet.org, name: meet.name }, 60)}<div><h1>${esc(meet.name)}</h1><p>${esc(fmtRange(meet.start, meet.end))}${uniqueEvents(meet).length ? ` · ${uniqueEvents(meet).length} ${T("pruebas")}` : ""}</p>${live ? liveTag() : ""}</div></div>
    ${teams.length ? `<div class="strip">${teams.map((t) => `<a href="#/m/${enc(id)}/t/${enc(t)}" title="${esc(t)}">${crest(t, 40)}</a>`).join("")}</div>` : ""}
    ${standings && tab === "pruebas" && standings.scores[0] ? `<a class="leader" href="#/m/${enc(id)}/clasificacion">${crest(standings.scores[0].t, 28)}<span>${T("Lidera {t} con {p} pts", { t: `<b>${esc(standings.scores[0].t)}</b>`, p: esc(standings.scores[0].pts) })}</span><span class="chev">›</span></a>` : ""}
  </section>
  ${(store.get("s:" + id) || {}).article ? `<a class="article" href="${esc(store.get("s:" + id).article)}" target="_blank" rel="noopener">${T("Crónica en SwimSwam")} ↗</a>` : ""}
  ${live && meet.lastEventUrl ? `<a class="lastev" href="#/m/${enc(id)}/e/${enc(eventKey(meet.lastEventUrl))}">⚡ ${T("Última prueba terminada")}</a>` : ""}
  <nav class="seg">${tabs.map(([k, l]) => `<a class="${k === tab ? "on" : ""}" href="#/m/${enc(id)}${k === "pruebas" ? "" : "/" + k}">${l}</a>`).join("")}</nav>
  ${body}`;
  if (tab === "pruebas") fillWinners(meet, live);
  if (live) scheduleRefresh((s) => meetView(id, tab, s));
}

// Pone el escudo y la marca del ganador en cada prueba, poco a poco.
async function fillWinners(meet, live) {
  const rows = [...document.querySelectorAll(".erow[data-ev]")];
  const urls = [...new Set(rows.map((r) => r.dataset.ev))];
  const here = location.hash;
  await pool(urls, 3, async (url) => {
    if (location.hash !== here) return;
    const ev = await loadEvent(url, live);
    const w = ev.results.find((r) => r.p === "1" && (!r.s || /Final|Champ/i.test(r.s))) || ev.results.find((r) => r.p === "1");
    if (!w) return;
    for (const row of document.querySelectorAll(`.erow[data-ev="${CSS.escape(url)}"]`)) {
      row.querySelector(".num").insertAdjacentHTML("afterend", crest(w.t, 34));
      row.querySelector(".win").innerHTML = `🥇 ${esc(ev.relay ? w.t : w.n)} · ${esc(w.m)}`;
      row.classList.add("done");
    }
  });
}

function resultRow(r, relay, id, fav) {
  const place = /^\d+$/.test(r.p) ? `<span class="place p${r.p}">${r.p}</span>` : `<span class="place dq">${esc(r.p)}</span>`;
  const extra = [];
  if (r.sw && r.sw.length) extra.push(`<div class="swimmers">${r.sw.map(esc).join(" · ")}</div>`);
  if (r.sp && r.sp.length) extra.push(`<div class="splits">${r.sp.map((s, i) => `<span><small>${(i + 1) * (r.sp.length > 8 ? 25 : 50)}</small>${esc(s)}</span>`).join("")}</div>`);
  return `<details class="rrow ${fav ? "fav" : ""}"><summary>
    ${place}${crest(r.t)}
    <span class="who"><strong>${esc(relay ? r.t + (r.l ? " " + r.l : "") : r.n)}</strong><small>${relay ? "" : esc(r.t) + (r.y ? " · " + esc(r.y) : "")}</small></span>
    <span class="time"><strong>${esc(r.m)}</strong>${r.pv ? `<small>${esc(r.pv)}</small>` : ""}${r.pts ? `<em>${esc(r.pts)} pts</em>` : ""}</span>
  </summary>${extra.join("") || `<div class="splits muted">${T("Sin parciales")}</div>`}
  <a class="tlink" href="#/m/${enc(id)}/t/${enc(r.t)}">${T("Ver todo de {t}", { t: esc(r.t) })} ›</a></details>`;
}

async function eventView(id, key, silent = false) {
  setTab("home");
  if (!silent) loading();
  await loadLogos().catch(() => {});
  let meet, ev;
  try {
    meet = await loadMeetIndex(id);
    const link = uniqueEvents(meet).find((e) => eventKey(e.url) === key);
    const url = link ? link.url : new URL(key + ".htm", meet.url).href;
    ev = await loadEvent(url, meet.status === "live");
  } catch {
    $app.innerHTML = `<a class="back" href="#/m/${enc(id)}">‹ ${T("Volver")}</a><div class="card muted">${T("Esta prueba todavía no tiene resultados. Se comprobará de nuevo cada minuto.")}</div>`;
    return scheduleRefresh((s) => eventView(id, key, s));
  }
  setTitle(ev.title);
  const f = favs();
  const onlyFav = store.get("onlyFav", false) && f.size;
  let lastSec = null;
  const rows = ev.results
    .filter((r) => !onlyFav || isFav(r.t, f))
    .map((r) => {
      let h = "";
      if (r.s && r.s !== lastSec) {
        lastSec = r.s;
        h = `<div class="sec">${esc(lang() === "en" ? r.s : SECTION_ES[r.s] || r.s)}</div>`;
      }
      return h + resultRow(r, ev.relay, id, isFav(r.t, f));
    })
    .join("");
  $app.innerHTML = `
  <a class="back" href="#/m/${enc(id)}">‹ ${esc(meet.name)}</a>
  <section class="ehead"><span class="num big">${ev.number ?? ""}</span><div><h1>${esc(englishToSpanish(ev.title))}</h1><p class="sub">${meet.status === "live" ? liveTag() : esc(fmtRange(meet.start, meet.end))}</p></div></section>
  ${f.size ? `<label class="toggle"><input type="checkbox" id="onlyFav" ${onlyFav ? "checked" : ""}> ${T("Solo mis universidades")}</label>` : ""}
  ${ev.records.length ? `<details class="records"><summary>${T("Récords")}</summary>${ev.records.map((r) => `<div>${esc(r)}</div>`).join("")}</details>` : ""}
  <div class="list">${rows || `<div class="card muted">${T("Sin resultados todavía.")}</div>`}</div>
  ${ev.scores.length ? `<h2>${T("Clasificación por equipos")}</h2><div class="list">${ev.scores.slice(0, 10).map((s) => `<a class="srow" href="#/m/${enc(id)}/t/${enc(s.t)}"><span class="place p${s.p}">${s.p}</span>${crest(s.t)}<span class="sname">${esc(s.t)}</span><span class="pts">${esc(s.pts)}<small> pts</small></span></a>`).join("")}</div><a class="more" href="#/m/${enc(id)}/clasificacion">${T("Ver clasificación completa")} ›</a>` : ""}`;
  const cb = document.getElementById("onlyFav");
  if (cb) cb.onchange = () => (store.set("onlyFav", cb.checked), eventView(id, key, true));
  if (meet.status === "live") scheduleRefresh((s) => eventView(id, key, s));
}

async function teamView(id, team, silent = false) {
  setTab("home");
  if (!silent) loading(T("Buscando resultados de {t}…", { t: team }));
  await Promise.all([loadLogos().catch(() => {}), loadBrands().catch(() => {})]);
  let meet;
  try {
    meet = await loadMeetIndex(id);
  } catch {
    return errorView("No se pudo abrir este campeonato.");
  }
  setTitle(team);
  const live = meet.status === "live";
  const events = uniqueEvents(meet);
  const parsed = await pool(events, 4, (e) => loadEvent(e.url, live));
  const rows = [];
  let medals = 0;
  let standing = null;
  parsed.forEach((ev) => {
    if (!ev) return;
    for (const s of ev.scores) if (sameTeam(s.t, team) && (!standing || ev.number >= standing.after)) standing = { ...s, after: ev.number };
    for (const r of ev.results) {
      if (!sameTeam(r.t, team)) continue;
      rows.push({ ev, r });
      if (["1", "2", "3"].includes(r.p) && (!r.s || /Final/.test(r.s))) medals++;
    }
  });
  rows.sort((a, b) => (a.ev.number ?? 0) - (b.ev.number ?? 0));
  $app.innerHTML = `
  <a class="back" href="#/m/${enc(id)}/equipos">‹ ${esc(meet.name)}</a>
  <section class="thead">${crest(team, 72)}<div><h1>${findUni(team) ? `<a href="#/uni/${enc(findUni(team).n)}">${esc(team)} ›</a>` : esc(team)}</h1><p class="sub">${standing ? `${standing.p}.º · ${esc(standing.pts)} ${T("puntos")} · ` : ""}${medals} ${T("podios")}</p></div>${star(team)}</section>
  <div class="list">${rows.map(({ ev, r }) => `<a class="trow" href="#/m/${enc(id)}/e/${enc(eventKey(ev.url))}"><span class="place p${r.p}">${esc(r.p)}</span><span class="who"><strong>${esc(ev.relay ? "Relevo " + (r.l || "") : r.n)}</strong><small>${esc(englishToSpanish(ev.title))}${r.s ? " · " + esc(SECTION_ES[r.s] || r.s) : ""}</small></span><span class="time"><strong>${esc(r.m)}</strong>${r.pts ? `<em>${esc(r.pts)} pts</em>` : ""}</span></a>`).join("") || `<div class="card muted">${T("Sin resultados todavía.")}</div>`}</div>`;
  if (live) scheduleRefresh((s) => teamView(id, team, s));
}

const DIVS = [["D1", "Division I"], ["D2", "Division II"], ["D3", "Division III"], ["NAIA", "NAIA"]];
const place = (u) => (u.city && u.city.includes(",") ? u.city : [u.city, u.st].filter(Boolean).join(", "));
const divLabel = (d) => (DIVS.find(([k]) => k === d) || [, d])[1];

async function universitiesView() {
  setTab("unis");
  setTitle(T("Universidades"));
  loading();
  await loadLogos().catch(() => {});
  const ranks = await loadRanks().catch(() => new Map());
  const f = favs();
  const flt = { div: "", conf: "", st: "", sex: "", q: "", sort: "rank", ...store.get("uniFilters", {}) };
  const save = () => store.set("uniFilters", { ...flt, q: "" });
  const confs = (div) => [...new Set(unis.filter((u) => !div || u.div === div).flatMap((u) => [u.cm, u.cw]).filter(Boolean))].sort();
  const states = [...new Set(unis.map((u) => u.st).filter(Boolean))].sort();
  const chip = (k, v, label) => `<button class="fchip ${flt[k] === v ? "on" : ""}" data-f="${k}" data-v="${esc(v)}">${esc(label)}</button>`;

  const render = () => {
    const ql = flt.q.trim().toLowerCase();
    const list = unis.filter(
      (u) =>
        (!flt.div || u.div === flt.div) &&
        (!flt.conf || u.cm === flt.conf || u.cw === flt.conf) &&
        (!flt.st || u.st === flt.st) &&
        (!flt.sex || (flt.sex === "m" ? u.men : u.women)) &&
        (!ql || [u.n, u.full, u.nick, u.city].some((x) => x && x.toLowerCase().includes(ql)))
    );
    document.getElementById("fbar").innerHTML = `
      <div class="frow">${chip("div", "", T("Todas"))}${DIVS.map(([k]) => chip("div", k, k === "NAIA" ? "NAIA" : k.replace("D", "D-"))).join("")}</div>
      <div class="frow">${chip("sex", "", T("Todos"))}${chip("sex", "m", T("Hombres"))}${chip("sex", "w", T("Mujeres"))}</div>
      <div class="frow">${chip("sort", "rank", "🏆 " + T("Ranking NCAA"))}${chip("sort", "az", "A-Z")}</div>
      <div class="frow selects">
        <label><span>${T("Conferencia")}</span><select id="fconf"><option value="">${T("Todas")}</option>${confs(flt.div).map((c) => `<option ${c === flt.conf ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
        <label><span>${T("Estado")}</span><select id="fst"><option value="">${T("Todos")}</option>${states.map((c) => `<option ${c === flt.st ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
      </div>`;
    const key = (u) => {
      const r = ranks.get(u);
      if (!r) return [Infinity, Infinity];
      const m = flt.sex === "m" ? r.M?.p ?? Infinity : flt.sex === "w" ? r.W?.p ?? Infinity : bestRank(r);
      return [m, (r.M?.p ?? 99) + (r.W?.p ?? 99)];
    };
    const sorted = flt.sort === "az" ? list : list.slice().sort((a, b) => { const x = key(a), y = key(b); return x[0] - y[0] || x[1] - y[1] || a.n.localeCompare(b.n); });
    const groups = DIVS.map(([k, label]) => [label, sorted.filter((u) => u.div === k)]).filter(([, l]) => l.length);
    const rk = (u) => {
      const r = ranks.get(u);
      if (!r) return "";
      return `<span class="rk">${r.M ? `<i>♂ ${r.M.p}º</i>` : ""}${r.W ? `<i>♀ ${r.W.p}º</i>` : ""}</span>`;
    };
    const row = (u) => `<a class="urow" href="#/uni/${enc(u.n)}">${crest(u.n, 34)}<span class="uinfo"><b>${esc(u.n)}</b><small>${esc([u.nick, u.city || u.st].filter(Boolean).join(" · "))}</small></span>${rk(u) || `<span class="dtag ${u.div}">${esc(u.cw || u.cm || "")}</span>`}${star(u.n)}</a>`;
    document.getElementById("ulist").innerHTML =
      (f.size && !ql && !flt.div && !flt.conf && !flt.st && !flt.sex ? `<h2>${T("Mis universidades")}</h2><div class="grid">${[...f].map((t) => `<a class="tcard" href="#/uni/${enc(t)}">${crest(t, 48)}<span>${esc(t)}</span>${star(t)}</a>`).join("")}</div>` : "") +
      (groups.length
        ? groups.map(([label, l]) => `<h2>${esc(label)} <span class="count">${l.length}</span></h2><div class="list">${l.slice(0, 700).map(row).join("")}</div>`).join("")
        : `<div class="card muted">${T("Ninguna universidad con estos filtros.")}</div>`);
    document.getElementById("fconf").onchange = (e) => ((flt.conf = e.target.value), save(), render());
    document.getElementById("fst").onchange = (e) => ((flt.st = e.target.value), save(), render());
  };
  $app.innerHTML = `<section class="pad"><h1>${T("Universidades")}</h1><p class="sub">${T("Marca con ★ las tuyas: aparecerán en la portada y podrás filtrar los resultados.")}</p>
    <input type="search" id="uq" placeholder="${T("Buscar universidad")}"></section><div id="fbar" class="fbar"></div><div id="ulist"></div>
    <p class="foot">${unis.length} ${T("universidades")} · ${T("Ranking: puesto en los últimos campeonatos NCAA/NAIA (♂ chicos, ♀ chicas).")} ${T("Datos de Wikipedia (CC BY-SA), Wikidata y webs oficiales.")}</p>`;
  document.getElementById("fbar").onclick = (e) => {
    const b = e.target.closest("[data-f]");
    if (!b) return;
    flt[b.dataset.f] = b.dataset.v;
    if (b.dataset.f === "div") flt.conf = "";
    save();
    render();
  };
  document.getElementById("uq").oninput = (e) => ((flt.q = e.target.value), render());
  render();
}

const ord = (n) => (lang() === "en" ? n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th") : `${n}º`);
const hrefOk = (u) => (u ? (u.startsWith("http") ? u : "https://" + u) : "");
async function uniView(name) {
  setTab("unis");
  loading();
  await Promise.all([loadLogos().catch(() => {}), loadBrands().catch(() => {})]);
  const u = unis.find((x) => x.n === name) || findUni(name);
  if (!u) return errorView("Universidad no encontrada.");
  setTitle(u.n);
  const [ranks, sw, calD] = await Promise.all([loadRanks().catch(() => new Map()), loadSwimmers().catch(() => []), loadData("calendario")]);
  const games = calD?.cal?.[u.n] || [];
  const r = ranks.get(u);
  const team = sw.filter((x) => x.u === u);
  const info = logoIndex ? matchTeam(logoIndex, u.n) || matchTeam(logoIndex, u.full) : null;
  const tint = info && info.color && info.color !== "#0b63ce" ? info.color : "#0b3d91";
  const fact = (label, value) => (value ? `<div class="fact"><small>${esc(label)}</small><b>${esc(value)}</b></div>` : "");
  const web = hrefOk(u.web);
  const ncaaRow = (g, label) => {
    const x = r?.[g];
    if (!x) return `<div class="nrow"><span>${label}</span><b class="muted">${ranks.partial?.has(u.div + g) ? T("Solo se publican campeón y subcampeón") : T("No puntuó")}</b></div>`;
    const medal = x.p <= 3 ? ["🥇", "🥈", "🥉"][x.p - 1] : "🏅";
    return `<div class="nrow"><span>${label}</span><b>${medal} ${ord(x.p)} <small>${x.of ? T("de {n}", { n: x.of }) + " · " : ""}${esc(x.pts)} pts</small></b></div>`;
  };
  const year = r?.M?.year || r?.W?.year || "";
  const staff = u.staff || [];
  const coachLine = u.coach ? fact(T("Entrenador principal"), u.coach) : fact(T("Entrenador (hombres)"), u.coachM) + fact(T("Entrenador (mujeres)"), u.coachW);
  const staffHtml = staff.length
    ? `<div class="list staff">${staff
        .map((p) => `<div class="srow"><span class="avatar">${esc(initials(p.n))}</span><span class="uinfo"><b>${esc(p.n)}</b><small>${esc(p.t)}${p.g ? ` · ${p.g === "M" ? T("Hombres") : T("Mujeres")}` : ""}</small>${p.e ? `<a href="mailto:${esc(p.e)}">✉️ ${esc(p.e)}</a>` : ""}</span></div>`)
        .join("")}</div>`
    : `<div class="card muted">${T("Esta universidad no publica su equipo técnico en un formato que se pueda leer.")}${u.staffUrl || web ? ` <a href="${esc(u.staffUrl || web)}" target="_blank" rel="noopener">${T("Ver en su web")} ↗</a>` : ""}</div>`;
  const yr = (y) => ({ FR: T("1º año"), SO: T("2º año"), JR: T("3º año"), SR: T("4º año"), GR: T("Posgrado"), "5Y": T("5º año") }[y] || "");
  const top = (x) => Object.entries(x.b)[0];
  const teamHtml = team.length
    ? `<div class="list">${team
        .sort((a, b) => (a.g || "").localeCompare(b.g || "") || a.n.localeCompare(b.n))
        .slice(0, 150)
        .map((x) => `<a class="urow" href="#/n/${x.i}"><span class="avatar ${x.g === "W" ? "w" : "m"}">${x.g === "W" ? "♀" : "♂"}</span><span class="uinfo"><b>${esc(x.n)}</b><small>${esc([yr(x.y), top(x) ? `${top(x)[0]} ${top(x)[1][0]}` : ""].filter(Boolean).join(" · "))}</small></span><span class="chev">›</span></a>`)
        .join("")}</div>`
    : `<div class="card muted">${T("Aún no hay nadadores de esta universidad en los resultados guardados de esta temporada.")}</div>`;
  const link = (h, label) => (h ? `<a href="${esc(h)}" target="_blank" rel="noopener">${label} ↗</a>` : "");
  $app.innerHTML = `
  <a class="back" href="#/u">‹ ${T("Universidades")}</a>
  <section class="mhero uhero" style="--tint:${tint}">
    <div class="mtop"><span class="bigcrest">${crest(u.n, 76)}</span><div><h1>${esc(u.n)}</h1><p>${esc(u.full)}</p><p>${esc(place(u))}</p></div>${star(u.n)}</div>
    <div class="pills"><span class="pill">${esc(divLabel(u.div))}</span>${u.men ? `<span class="pill">♂ ${T("Hombres")}</span>` : ""}${u.women ? `<span class="pill">♀ ${T("Mujeres")}</span>` : ""}${u.diving ? `<span class="pill">🤿 ${T("Saltos")}</span>` : ""}</div>
  </section>
  <h2>🏆 ${T("Últimos campeonatos nacionales")} ${year ? `<span class="count">${esc(year)}</span>` : ""}</h2>
  <div class="card ncaa">${u.men ? ncaaRow("M", "♂ " + T("Hombres")) : ""}${u.women ? ncaaRow("W", "♀ " + T("Mujeres")) : ""}</div>
  <div class="facts">
    ${fact(T("Apodo"), u.nick)}
    ${fact(T("División"), divLabel(u.div))}
    ${u.cm && u.cm === u.cw ? fact(T("Conferencia"), u.cm) : fact(`${T("Conferencia")} · ${T("Hombres")}`, u.cm) + fact(`${T("Conferencia")} · ${T("Mujeres")}`, u.cw)}
    ${fact(T("Ciudad"), place(u))}
    ${coachLine}
    ${u.email ? `<div class="fact"><small>${T("Correo de la universidad")}</small><b><a href="mailto:${esc(u.email)}">${esc(u.email)}</a></b></div>` : ""}
  </div>
  <a class="btn wide" href="#/u/${enc(u.n)}">🏊 ${T("Ver sus resultados")}</a>
  ${u.hytek ? `<a class="btn wide alt" href="#/m/${enc(`https://www.sidearmstats.com/${u.hytek}/swim/evtindex.htm`)}">⏱️ ${T("Su última competición en casa")}</a>` : ""}
  ${games.length ? `<h2>📅 ${T("Calendario y resultados")} <span class="count">${games.length}</span></h2><div class="list">${games.map((g) => gameRow(u.n, g)).join("")}</div>` : ""}
  <h2>👥 ${T("Equipo técnico y contacto")} ${staff.length ? `<span class="count">${staff.length}</span>` : ""}</h2>
  ${staffHtml}
  <h2>🏊 ${T("Nadadores")} ${team.length ? `<span class="count">${team.length}</span>` : ""}</h2>
  ${teamHtml}
  <div class="links">${link(web, T("Web oficial"))}${link(u.uweb, T("Web de la universidad"))}${link(u.staffUrl || u.staffMUrl, T("Equipo técnico"))}${link(u.staffWUrl, T("Equipo técnico (mujeres)"))}${link(u.rosterUrl || u.rosterMUrl, T("Plantilla oficial"))}${link(u.rosterWUrl, T("Plantilla oficial (mujeres)"))}${link(u.wiki, "Wikipedia")}</div>
  <p class="foot">${T("Nadadores sacados de los resultados públicos de esta temporada y de los últimos NCAA. Datos de Wikipedia (CC BY-SA), Wikidata y la web oficial de la universidad.")}</p>`;
}

function gameRow(team, g, both = false) {
  const today = todayUS();
  const when = g.d ? fmtDate(g.d) : g.dt || "";
  const won = /^W\b/i.test(g.r || ""), lost = /^L\b/i.test(g.r || "");
  const link = g.live || g.res || g.recap;
  const href = g.live ? `#/m/${enc(normalizeMeetUrl(g.live))}` : link;
  const inner = `${both ? crest(team, 30) : ""}<span class="vs">${g.at === "at" ? "@" : "vs"}</span>${crest(g.o, 30)}<span class="uinfo"><b>${both ? `${esc(team)} ${g.at === "at" ? "@" : "vs"} ` : ""}${esc(g.o)}</b><small>${esc([when, g.g === "M" ? "♂" : g.g === "W" ? "♀" : "", g.d && g.d >= today && !g.r ? T("próximamente") : ""].filter(Boolean).join(" · "))}</small></span>${g.r ? `<span class="res ${won ? "w" : lost ? "l" : ""}">${esc(g.r)}</span>` : ""}${link ? `<span class="chev">${g.live ? "›" : "↗"}</span>` : ""}`;
  return link ? `<a class="urow game" href="${esc(href)}" ${g.live ? "" : 'target="_blank" rel="noopener"'}>${inner}</a>` : `<div class="urow game">${inner}</div>`;
}
async function dualsSection() {
  const d = await loadData("calendario");
  if (!d?.cal) return "";
  const today = todayUS();
  const from = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const seen = new Set();
  const list = [];
  const fav = favs();
  for (const [team, games] of Object.entries(d.cal))
    for (const g of games) {
      if (!g.d || g.d < from || g.d > to || /invit|invite|classic|championship|intrasquad|scarlet|time trial|last chance|of \d+ teams/i.test(g.o + " " + (g.r || "")) || !findUni(g.o)) continue;
      const k = [g.d, ...[team, g.o].map((x) => (findUni(x)?.n || x).toLowerCase()).sort()].join("|");
      if (seen.has(k)) continue;
      seen.add(k);
      list.push({ team, g, fav: isFav(team, fav) || isFav(g.o, fav) });
    }
  if (!list.length) return "";
  list.sort((a, b) => b.fav - a.fav || (a.g.d >= today) - (b.g.d >= today) || (a.g.d >= today ? a.g.d.localeCompare(b.g.d) : b.g.d.localeCompare(a.g.d)));
  return `<section><h2>⚔️ ${T("Encuentros entre universidades")} <span class="count">${list.length}</span></h2><div class="list">${list.slice(0, 25).map((x) => gameRow(x.team, x.g, true)).join("")}</div>${list.length > 25 ? `<p class="sub">${T("Y {n} más en la ficha de cada universidad.", { n: list.length - 25 })}</p>` : ""}</section>`;
}

async function swimmersView() {
  setTab("nad");
  setTitle(T("Nadadores"));
  loading("Cargando nadadores…");
  const sw = await loadSwimmers().catch(() => []);
  const q0 = store.get("swq", "");
  $app.innerHTML = `<section class="pad"><h1>${T("Nadadores")}</h1><p class="sub">${T("Nadadores de universidades de EE. UU. que aparecen en los resultados de esta temporada y de los últimos NCAA.")}</p>
    <input type="search" id="sq" placeholder="${T("Buscar nadador o universidad")}" value="${esc(q0)}"></section><div id="slist"></div>
    <p class="foot">${sw.length} ${T("nadadores")}${sw.updated ? ` · ${T("actualizado")} ${esc(fmtDate(sw.updated))}` : ""}</p>`;
  const render = (q) => {
    store.set("swq", q);
    const words = q.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).filter(Boolean);
    const box = document.getElementById("slist");
    if (!words.length) {
      box.innerHTML = `<div class="card muted">${T("Escribe un nombre (por ejemplo «Gemmell») o una universidad.")}</div>`;
      return;
    }
    const hay = (x) => (x._h ||= `${x.n} ${x.t} ${x.u ? x.u.n + " " + x.u.full : ""}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
    const hits = sw.filter((x) => words.every((w) => hay(x).includes(w))).slice(0, 120);
    box.innerHTML = hits.length
      ? `<div class="list">${hits.map((x) => `<a class="urow" href="#/n/${x.i}">${crest(x.u ? x.u.n : x.t, 34)}<span class="uinfo"><b>${esc(x.n)}</b><small>${esc([x.u ? x.u.n : x.t, x.g === "W" ? "♀" : x.g === "M" ? "♂" : "", x.y].filter(Boolean).join(" · "))}</small></span><span class="chev">›</span></a>`).join("")}</div>`
      : `<div class="card muted">${T("No hay nadadores con ese nombre en los resultados guardados.")}</div>`;
  };
  const input = document.getElementById("sq");
  input.oninput = (e) => render(e.target.value);
  render(q0);
}

async function swimmerView(i) {
  setTab("nad");
  loading();
  const sw = await loadSwimmers().catch(() => []);
  const x = sw[+i];
  if (!x) return errorView("Nadador no encontrado.");
  setTitle(x.n);
  const uname = x.u ? x.u.n : x.t;
  const info = logoIndex ? matchTeam(logoIndex, uname) : null;
  const tint = info && info.color && info.color !== "#0b63ce" ? info.color : "#0b3d91";
  const yr = { FR: T("1º año"), SO: T("2º año"), JR: T("3º año"), SR: T("4º año"), GR: T("Posgrado"), "5Y": T("5º año") }[x.y] || "";
  $app.innerHTML = `<a class="back" href="#/n">‹ ${T("Nadadores")}</a>
  <section class="mhero uhero" style="--tint:${tint}">
    <div class="mtop"><span class="bigcrest">${crest(uname, 76)}</span><div><h1>${esc(x.n)}</h1><p>${x.u ? `<a href="#/uni/${enc(x.u.n)}">${esc(x.u.full || x.u.n)}</a>` : esc(x.t)}</p><p>${esc([x.g === "W" ? T("Mujeres") : x.g === "M" ? T("Hombres") : "", yr].filter(Boolean).join(" · "))}</p></div></div>
  </section>
  <h2>⏱️ ${T("Mejores marcas")}</h2>
  ${Object.keys(x.b).length ? `<div class="list">${Object.entries(x.b).map(([ev, [t, m]]) => `<div class="srow"><span class="uinfo"><b>${esc(ev)}</b><small>${esc(m)}</small></span><span class="time">${esc(t)}</span></div>`).join("")}</div>` : `<div class="card muted">${T("Aún no tiene marcas en los resultados guardados de esta temporada.")}</div>`}
  ${x.m.length ? `<h2>📅 ${T("Competiciones")}</h2><div class="card">${x.m.map((m) => `<div class="mline">${esc(m)}</div>`).join("")}</div>` : ""}
  ${x.ro ? `<p class="sub center">✅ ${T("En la plantilla oficial de su universidad")}</p>` : ""}
  ${x.u ? `<a class="btn wide" href="#/uni/${enc(x.u.n)}">🎓 ${T("Ver universidad")}</a>` : ""}
  <p class="foot">${T("Marcas oficiosas de los resultados públicos (Y = yardas, M = metros).")}</p>`;
}

const THEMES = [["auto", "Automático"], ["light", "Claro"], ["dark", "Oscuro"]];
const BGS = [["ocean", "Océano"], ["sunset", "Atardecer"], ["forest", "Bosque"], ["lavender", "Lavanda"], ["graphite", "Grafito"]];
function applySettings() {
  const root = document.documentElement;
  const th = store.get("theme", "auto");
  if (th === "auto") delete root.dataset.theme;
  else root.dataset.theme = th;
  root.dataset.bg = store.get("bg", "ocean");
  root.lang = lang();
  const labels = { home: T("Campeonatos"), unis: T("Universidades"), nad: T("Nadadores"), ajustes: T("Ajustes") };
  document.querySelectorAll(".tabbar a").forEach((a) => {
    const l = a.querySelector("em");
    if (l) l.textContent = labels[a.dataset.tab];
  });
  const logo = document.querySelector(".logo b");
  if (logo) logo.textContent = lang() === "en" ? "Swim USA" : "Natación USA";
}

function settingsView() {
  setTab("ajustes");
  setTitle(T("Ajustes"));
  const seg = (key, items, cur) => `<div class="seg opts" data-key="${key}">${items.map(([v, l]) => `<button class="${v === cur ? "on" : ""}" data-v="${v}">${esc(T(l))}</button>`).join("")}</div>`;
  $app.innerHTML = `<section class="pad"><h1>${T("Ajustes")}</h1></section>
  <div class="card settings">
    <h3>${T("Idioma")}</h3>${seg("lang", [["es", "Español"], ["en", "English"]], lang())}
    <h3>${T("Tema")}</h3>${seg("theme", THEMES, store.get("theme", "auto"))}
    <h3>${T("Fondo")}</h3>
    <div class="swatches" data-key="bg">${BGS.map(([v, l]) => `<button class="sw ${v === store.get("bg", "ocean") ? "on" : ""}" data-v="${v}" data-bgs="${v}"><i></i><span>${esc(T(l))}</span></button>`).join("")}</div>
  </div>
  <div class="card settings"><button class="btn ghost" id="clear">${T("Borrar datos guardados")}</button></div>
  <p class="foot">${lang() === "en" ? "Swim USA · results from public HY-TEK pages, SwimSwam feed, ESPN team logos and Wikipedia." : "Natación USA · resultados de páginas públicas HY-TEK, canal de SwimSwam, escudos de ESPN y Wikipedia."}</p>`;
  $app.onclick = null;
  $app.querySelectorAll("[data-key]").forEach((g) =>
    g.addEventListener("click", (e) => {
      const b = e.target.closest("[data-v]");
      if (!b) return;
      store.set(g.dataset.key, b.dataset.v);
      applySettings();
      settingsView();
    })
  );
  document.getElementById("clear").onclick = () => {
    const keep = ["favs", "lang", "theme", "bg"].map((k) => [k, store.get(k)]);
    try {
      localStorage.clear();
    } catch {}
    keep.forEach(([k, v]) => v !== undefined && store.set(k, v));
    mem.clear();
    logoIndex = null;
    document.getElementById("clear").textContent = T("Datos guardados borrados.");
  };
}

async function favTeamView(team) {
  // Busca la universidad en los campeonatos en directo o más recientes.
  setTab("unis");
  loading(`Buscando ${team}…`);
  const list = await loadAllMeets().catch(() => []);
  const target = list.find((s) => s.status === "live") || list.filter((s) => s.status === "done").sort((a, b) => (b.start || "").localeCompare(a.start || ""))[0];
  if (target) location.replace(`#/m/${enc(target.id)}/t/${enc(team)}`);
  else errorView("No hay campeonatos con resultados ahora mismo.");
}

// ---------- enrutado ----------
function route() {
  clearInterval(refreshTimer);
  applySettings();
  const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  window.scrollTo(0, 0);
  if (parts[0] === "m" && parts[1]) {
    if (parts[2] === "e" && parts[3]) return eventView(parts[1], parts[3]);
    if (parts[2] === "t" && parts[3]) return teamView(parts[1], parts[3]);
    return meetView(parts[1], parts[2] || "pruebas");
  }
  if (parts[0] === "u" && parts[1]) return favTeamView(parts[1]);
  if (parts[0] === "uni" && parts[1]) return uniView(parts[1]);
  if (parts[0] === "ajustes") return settingsView();
  if (parts[0] === "n" && parts[1]) return swimmerView(parts[1]);
  if (parts[0] === "n") return swimmersView();
  if (parts[0] === "u") return universitiesView();
  return homeView();
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-fav]");
  if (!b) return;
  e.preventDefault();
  e.stopPropagation();
  toggleFav(b.dataset.fav);
  const on = favs().has(b.dataset.fav);
  document.querySelectorAll(`[data-fav="${CSS.escape(b.dataset.fav)}"]`).forEach((x) => {
    x.classList.toggle("on", on);
    x.textContent = on ? "★" : "☆";
  });
});
["gesturestart", "gesturechange", "gestureend"].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
document.addEventListener("touchmove", (e) => e.touches.length > 1 && e.preventDefault(), { passive: false });
window.addEventListener("hashchange", route);
route();

// Si la web de alojamiento pone un distintivo flotante abajo, sube la barra de pestañas.
function checkBadge() {
  const ours = new Set([document.querySelector(".top"), $app, document.querySelector(".tabbar")]);
  const extra = [...document.body.children]
    .filter((el) => !ours.has(el) && !["SCRIPT", "STYLE", "LINK", "NOSCRIPT"].includes(el.tagName))
    .some((el) => [el, ...el.querySelectorAll("*")].some((x) => {
      const cs = getComputedStyle(x);
      const r = x.getBoundingClientRect();
      return cs.position === "fixed" && r.height > 0 && r.bottom > innerHeight - 160;
    }));
  document.body.classList.toggle("has-badge", extra);
}
[1500, 4000, 9000].forEach((ms) => setTimeout(checkBadge, ms));
new MutationObserver(() => setTimeout(checkBadge, 300)).observe(document.body, { childList: true });

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
