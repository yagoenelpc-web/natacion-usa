import { normalizeMeetUrl, parseIndex, parseEvent, parseCatalog, parseFeed, uniqueEvents, isLive, organization, todayUS, roundOf } from "./parser.js";
import { flagOf } from "./flags.js";
import { buildIndex, matchTeam, initials, colorFor, norm, BRAND_PAGES, CONF_WORDS, SPONSOR_WORDS } from "./logos.js";

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
  dual: { label: "Duales", short: "VS", get full() { return T("Más encuentros con resultados"); } },
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
  "piscina larga": "long course", "Atrás": "Back", "Ranking de la temporada": "Season ranking", "{n} equipos": "{n} teams", "Chicos": "Men", "Chicas": "Women", "Aún no hay tiempos de esta temporada para estos equipos.": "No times this season for these teams yet.", "Sin tiempos esta temporada": "No times this season", "Ranking orientativo calculado con los 3 mejores tiempos de cada equipo en cada prueba individual de yardas esta temporada, puntuando como un campeonato (20, 17, 16… a los 16 primeros).": "Approximate ranking using each team's top 3 times in every individual yards event this season, scored like a championship (20, 17, 16… for the top 16).", "Actualizado": "Updated", "Natación": "Swimming", "Universidad": "School", "Tiempos del equipo": "Team times", "{p} pts · de {n}": "{p} pts · of {n}", "Sin tiempos aún": "No times yet", "Aún no hay tiempos de esta temporada para este equipo.": "No times this season for this team yet.", "Sí": "Yes", "Ver el campus en vídeo": "Watch a campus video", "Instalaciones de natación": "Swimming facilities", "Instagram del equipo": "Team Instagram", "Instagram de deportes": "Athletics Instagram", "Web de natación": "Swimming website", "Piscina": "Pool", "Piscina de 25 yardas": "25-yard pool", "Piscina de 50 metros": "50-meter pool", "Piscina de 25 metros": "25-meter pool", "Carriles": "Lanes", "Foso de saltos": "Diving well", "Aforo": "Seating", "Inaugurada": "Opened", "Litros de agua": "Water volume", "galones": "gallons", "Más sobre la piscina": "More about the pool", "Equipo de saltos": "Diving team", "La universidad no publica los datos de su piscina en un formato que se pueda leer.": "The school doesn't publish its pool details in a readable format.", "Buscarla": "Search for it", "Datos": "Facts", "Nombre completo": "Full name", "Datos de la web oficial de deportes de la universidad, Wikipedia (CC BY-SA) y Wikidata.": "Data from the school's official athletics site, Wikipedia (CC BY-SA) and Wikidata.", "Conócela": "Get to know it",
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
  "Convertir tiempo": "Convert time", "Buscar prueba: espalda, 200 estilos…": "Search event: back, 200 IM…", "Ninguna prueba coincide.": "No events match.", "{n} inscritos · aún sin nadar": "{n} entries · not swum yet", "Aún no hay resultados de esta prueba. Esta es la lista de inscritos con su marca de inscripción; se actualizará sola cuando la publiquen.": "No results for this event yet. This is the entry list with seed times; it will update by itself once results are posted.", "Más encuentros con resultados": "More dual meets with results", "Su universidad está compitiendo ahora: es probable que {n} esté nadando aquí.": "Their school is competing now, so {n} is probably swimming here.", "Próxima competición de su universidad": "Their school's next meet", "¿Dónde compite su universidad?": "Where is their school competing?", "Equipo masculino": "Men's team", "Equipo femenino": "Women's team", "Otros nadadores": "Other swimmers", "nadadores": "swimmers", "Buscar competición por nombre…": "Search meets by name…", "Resultados de la búsqueda": "Search results", "No hay ninguna competición con ese nombre.": "No meets with that name.", "Ficha en la web de la universidad": "Profile on the school website", "Su universidad no publica una biografía que se pueda leer.": "The school doesn't publish a readable bio.", "Entrenador": "Coach", "Resultados originales en la web de la universidad": "Original results on the school website", "Resultados completos guardados": "Saved full results", "Temporada": "Season", "Aún no tiene marcas en los resultados guardados.": "No times in the saved results yet.", "Mis favoritas": "My favorites", "Mis nadadores": "My swimmers", "Marca con ☆ a tus nadadores y saldrán aquí.": "Tap ☆ on your swimmers and they'll show up here.", "Aún no tienes universidades favoritas. Toca ☆ en cualquiera para guardarla.": "No favorite schools yet. Tap ☆ on any school to save it.", "Últimas competiciones": "Latest meets", "Cerrar": "Close", "Libre": "Free", "Espalda": "Back", "Braza": "Breast", "Mariposa": "Fly", "Estilos": "IM", "Yardas (25 yd)": "Yards (25 yd)", "Piscina corta (25 m)": "Short course (25 m)", "Piscina larga (50 m)": "Long course (50 m)", "Conversión aproximada con los factores habituales (yardas ×1,11 y virajes de 25 m). Úsala como orientación.": "Approximate conversion using the usual factors (yards ×1.11 and 25 m turns). Use it as a guide.",
  "Compitiendo ahora": "Competing now", "Última competición": "Last meet", "Próxima competición": "Next meet", "¿Dónde compite?": "Where are they competing?", "Ahora mismo no está compitiendo.": "Not competing right now.", "Ver resultados aquí": "See results here", "Ver en la web de la universidad": "See on the school's site", "en casa": "at home",
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
const swKey = (x) => `${x.n}|${x.u ? x.u.n : x.t}`;
const favSw = () => new Set(store.get("favSw", []));
const swStar = (x) => { const on = favSw().has(swKey(x)); return `<button class="star ${on ? "on" : ""}" data-favsw="${esc(swKey(x))}" aria-label="Favorito">${on ? "★" : "☆"}</button>`; };
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
  const cached = store.get("brands6");
  if (cached && Date.now() - cached.t < 30 * 864e5 && Object.keys(cached.v).length) return (brands = cached.v);
  const entries = await Promise.all(
    Object.entries(BRAND_PAGES).map(async ([k, page]) => {
      if (page.startsWith("http")) return [k, page];
      try {
        const d = JSON.parse(await api(`https://en.wikipedia.org/api/rest_v1/page/summary/${page}`, 86400));
        return [k, (d.thumbnail || d.originalimage || {}).source];
      } catch {
        return [k, null];
      }
    })
  );
  brands = Object.fromEntries(entries.filter(([, v]) => v));
  // Logos oficiales de las conferencias (ESPN), mejores que la imagen de Wikipedia (a menudo un mapa).
  const mk = await loadData("marcas").catch(() => null);
  const espn = { acc: 1, big12: 4, bigten: 5, sec: 8, pac12: 9, cusa: 12, mac: 15, mw: 17, sunbelt: 37, aac: 151 };
  for (const [k, g] of Object.entries(espn)) brands[k] = `https://a.espncdn.com/i/teamlogos/ncaa_conf/500/${g}.png`;
  Object.assign(brands, mk?.conf || {});
  store.set("brands6", { t: Date.now(), v: brands });
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
  // Índice ligero (nad-indice.json); las marcas de cada uno se bajan al abrir su ficha (web/data/nad/<trozo>.json).
  let [d, pl, fpast, fextra, forig] = await Promise.all([loadData("nad-indice"), loadData("plantillas"), loadData("fotos-pasadas").catch(() => null), loadData("fotos-extra").catch(() => null), loadData("origen").catch(() => null)]);
  if (d?.s) d = { updated: d.updated, swimmers: d.s.map(([n, t, g, y, te, tt, l]) => ({ n, t, g, y, l, b: {}, m: [], top: te ? [te, tt] : null, src: [[n, t]] })) };
  else d = await loadData("nadadores");
  const secs = (t) => { const m = /^(?:(\d+):)?(\d+\.\d+)/.exec(t || ""); return m ? (+m[1] || 0) * 60 + +m[2] : Infinity; };
  const merged = new Map();
  for (const x of d?.swimmers || []) {
    // "Francesca T Denucci" y "Francesca Denucci" son la misma persona (inicial del segundo nombre en algunos PDF).
    const n = x.n.trim().replace(/\s+[A-Z]\.?(?=\s)/g, "");
    if (n.split(/\s+/).length < 2) continue;
    const u = findUni(x.t);
    const k = n.toLowerCase() + "|" + (u ? u.n : x.t.toLowerCase());
    const prev = merged.get(k);
    if (!prev) {
      merged.set(k, { ...x, n, u, b: { ...x.b }, m: [...x.m], ...(x.src ? { src: [...x.src] } : {}) });
      continue;
    }
    prev.y ||= x.y;
    prev.g ||= x.g;
    if (x.src) prev.src = [...(prev.src || []), ...x.src];
    if (x.top && (!prev.top || secs(x.top[1]) / (+x.top[0].split(" ")[0] || 100) < secs(prev.top[1]) / (+prev.top[0].split(" ")[0] || 100))) prev.top = x.top;
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
    for (const [g, names] of Object.entries(p)) for (const e of names) {
      const [full, img] = Array.isArray(e) ? e : [e, ""];
      const tk = full.trim().split(/\s+/);
      list.push({ full, img, first: tk[0], last: tk.slice(1).join(" "), g: g === "X" ? "" : g, used: false });
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
    x.rf = r.full;
    if (r.img) x.img = r.img;
  }
  // Sin foto este año: la de su plantilla de temporadas anteriores, o una foto libre de Wikimedia Commons.
  const pastBy = new Map();
  for (const [name, m] of Object.entries(fpast?.u || {})) { const u = unis.find((x) => x.n === name); if (u) pastBy.set(u, Object.entries(m).map(([full, img]) => { const tk = full.trim().split(/\s+/); return { first: tk[0], last: tk.slice(1).join(" "), img }; })); }
  const kx = (n) => low(n).replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
  for (const x of merged.values()) {
    if (x.img) continue;
    const ps = x.u && pastBy.get(x.u);
    if (ps) {
      const tk = x.n.split(/\s+/), f = low(tk[0]), rest = tk.slice(1).map(low);
      const r = ps.find((r) => { const l = low(r.last).split(/[\s-]+/); return (rest.includes(l[0]) || rest.includes(l[l.length - 1])) && (low(r.first).startsWith(f) || f.startsWith(low(r.first))); });
      if (r) { x.img = r.img; continue; }
    }
    const ex = fextra?.f?.[kx(x.n)];
    if (ex) x.img = ex;
  }
  // Ciudad de origen (para la bandera) desde las plantillas de esta temporada y las anteriores.
  for (const x of merged.values()) {
    const o = x.u && forig?.u?.[x.u.n];
    if (!o) continue;
    if (o[x.rf || x.n]) { x.ht = o[x.rf || x.n]; continue; }
    const tk = x.n.split(/\s+/), f = low(tk[0]), rest = tk.slice(1).map(low);
    const hit = Object.entries(o).find(([n]) => { const t = n.split(/\s+/).map(low); return (rest.includes(t[1]) || rest.includes(t[t.length - 1])) && (t[0].startsWith(f) || f.startsWith(t[0])); });
    if (hit) x.ht = hit[1];
  }
  for (const [u, ro] of byUni) for (const r of ro) if (!r.used) merged.set("ro|" + u.n + "|" + r.full, { n: r.full, t: u.n, u, g: r.g, b: {}, m: [], ro: true, ...(r.img ? { img: r.img } : {}), ...(forig?.u?.[u.n]?.[r.full] ? { ht: forig.u[u.n][r.full] } : {}) });
  swimmers = [...merged.values()].sort((a, b) => a.n.localeCompare(b.n)).map((x, i) => ({ ...x, i }));
  swimmers.updated = d?.updated || "";
  swimmers.mi = d?.mi || {};
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
    host: m.host || "",
  }));
}

async function loadArchiveRaw() {
  const list = await loadArchive();
  const d = await loadData("archivo");
  const host = new Map((d?.meets || []).map((m) => [m.url.split("#")[0], m.host]));
  return list.map((m) => ({ ...m, host: host.get(m.id) || hostOf(m.name)?.team || "" }));
}

// Encuentros guardados (PDF y HY-TEK de los calendarios de cada universidad): id "r:<código>".
const isStored = (id) => /^r:[0-9a-f]+$/.test(id || "");
let resIdx = null;
async function loadResIndex() {
  if (resIdx) return resIdx;
  const d = await loadData("encuentros");
  resIdx = { done: d?.done || {}, meets: d?.meets || [] };
  resIdx.byId = new Map(resIdx.meets.map((m) => [m.id, m]));
  return resIdx;
}
const resIdOf = (url) => (url && resIdx && resIdx.done[url]) || "";
async function loadStored(id) {
  const d = await loadData("m/" + id.slice(2));
  if (!d) throw new Error("no encontrado");
  return d;
}
async function loadMeetIndex(id) {
  if (isStored(id)) {
    const d = await loadStored(id);
    const events = d.ev.map((e, i) => ({ number: e.no, name: e.ti, url: `${id}/${i}`, round: roundOf(e.ti), relay: !!e.r }));
    const meet = { url: id + "/", id, name: d.n, start: d.d || null, end: d.e || d.d || null, lastEventUrl: null, sessions: [{ title: "Session", day: "", events }], status: "done", src: d.src, host: (d.u || [])[0] || "", stored: true };
    meet.org = isDual(d.n) || (d.u || []).length ? (/(champ|conference|league)/i.test(d.n) ? organization(d.n) : "dual") : organization(d.n);
    return meet;
  }
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
  const sm = /^(r:[0-9a-f]+)\/(\d+)$/.exec(url);
  if (sm) {
    const d = await loadStored(sm[1]);
    const e = d.ev[+sm[2]];
    const ev = { url, meetName: d.n, title: e.ti, number: e.no, relay: !!e.r, records: [],
      results: e.res.map(([p, n, t, y, m, pv, pts, l, sw]) => ({ p, n, t, y, m, pv, pts, l, times: [m], s: "", sp: [], sw: sw || [] })),
      scores: (e.sc || []).map(([p, t, pts, g]) => ({ p, t, pts, ...(g ? { g } : {}) })) };
    rememberTeams(ev);
    return ev;
  }
  const html = await api(url, live ? 45 : 6 * 3600);
  let ev = parseEvent(html, url, { entries: true });
  if (!ev.title && hops < 2) {
    // "Última prueba" a veces es una página que redirige (meta refresh, marco o script).
    const m = /http-equiv=["']?refresh["']?[^>]*url=([^"'>\s]+)/i.exec(html) || /<i?frame[^>]+src=["']?([^"'>\s]+)/i.exec(html) || /location(?:\.href)?\s*=\s*["']([^"']+)/i.exec(html);
    if (m) return loadEvent(new URL(m[1], url).href, live, hops + 1);
  }
  if (ev.psych) for (const r of ev.results) if (/^\d+$/.test(r.y)) r.y = "";
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
  await Promise.all([loadBrands().catch(() => {}), loadLogos().catch(() => {}), loadUnis().catch(() => {})]);
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
  <input type="search" id="mq" class="msearch" placeholder="🔎 ${T("Buscar competición por nombre…")}" autocomplete="off" enterkeyhint="search">
  <div id="mres"></div>
  <section>
    <h2>${T("En directo")}</h2>
    ${live.length ? live.map(meetCard).join("") : `<div class="card muted">${T("Ahora mismo no hay ningún campeonato en directo.")}${next ? ` ${T("El próximo es")} <a href="#/m/${enc(next.id)}">${esc(next.name)}</a>, ${daysUntil(next.start) === 1 ? T("mañana") : T("dentro de {n} días", { n: daysUntil(next.start) })}.` : ""}</div>`}
  </section>
  <div id="duals"></div>
  ${f.length ? `<section><h2>${T("Mis universidades")}</h2><div class="chips">${f.map((t) => `<a class="chip" href="#/u/${enc(t)}">${crest(t, 22)}${esc(t)}</a>`).join("")}</div></section>` : ""}
  ${upcoming.length ? `<details class="fold"><summary><h2>${T("Próximamente")} <span class="count">${upcoming.length}</span></h2></summary>${upcoming.filter((s) => !s.pending).map(meetCard).join("")}${
    upcoming.some((s) => s.pending) ? `<details class="announced"><summary>${T("Anunciados, aún sin resultados")} (${upcoming.filter((s) => s.pending).length})</summary>${upcoming.filter((s) => s.pending).map(meetCard).join("")}</details>` : ""
  }</details>` : ""}
  ${Object.keys(ORG).filter((o) => byOrg[o]).map((o) => `<details class="fold"><summary><h2 class="orgh">${o === "conf" ? "" : orgLogo(o, 26)} ${esc(ORG[o].full)} <span class="count">${byOrg[o].length}</span></h2></summary>${byOrg[o].map(meetCard).join("")}</details>`).join("")}
  <p class="foot">${lang() === "en" ? `Dual meets and calendars from each school's official site. Data from public HY-TEK results pages. Live meets also found via the <a href="https://swimswam.com" target="_blank" rel="noopener">SwimSwam</a> RSS feed. Times are unofficial until published as official.` : `Duales y calendarios de la web oficial de cada universidad. Datos de las páginas públicas de resultados HY-TEK. Competiciones en directo encontradas también gracias al canal RSS de <a href="https://swimswam.com" target="_blank" rel="noopener">SwimSwam</a>. Los tiempos son oficiosos hasta su publicación oficial.`}</p>`;
  dualsSection().then((h) => { const el = document.getElementById("duals"); if (el) el.outerHTML = h; }).catch(() => {});
  setupMeetSearch(list);
}
// Buscador de competiciones: campeonatos (archivo y catálogo) y encuentros guardados de las universidades.
function setupMeetSearch(list) {
  const box = document.getElementById("mq"), out = document.getElementById("mres");
  if (!box) return;
  const low = (t) => (t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let all = null, timer = 0;
  const build = async () => {
    await loadResIndex().catch(() => null);
    const seen = new Set(list.map((m) => m.id));
    const stored = (resIdx?.meets || []).filter((m) => !seen.has(m.id)).map((m) => ({ id: m.id, name: m.n, start: m.d, end: m.e, org: /champ|conference|league/i.test(m.n) ? organization(m.n) : "dual", host: m.u[0], unis: m.u.join(" ") }));
    return [...list, ...stored].map((m) => ({ ...m, key: low(`${m.name} ${m.unis || ""} ${m.host || ""} ${(m.start || "").slice(0, 4)}`) }));
  };
  const draw = async () => {
    const q = low(box.value.trim());
    if (q.length < 2) { out.innerHTML = ""; return; }
    all ||= await build();
    const words = q.split(/\s+/);
    const hits = all.filter((m) => words.every((w) => m.key.includes(w))).sort((a, b) => (b.start || "").localeCompare(a.start || "")).slice(0, 60);
    out.innerHTML = `<section><h2>${T("Resultados de la búsqueda")} <span class="count">${hits.length}${hits.length === 60 ? "+" : ""}</span></h2><div class="list">${hits.map((m) => `<a class="urow mrow" href="#/m/${enc(m.id)}">${meetBadge(m, 34)}<span class="uinfo"><b>${esc(m.name)}</b><small>${esc([m.start ? fmtRange(m.start, m.end) : "", m.unis && m.unis !== m.host ? m.unis : ""].filter(Boolean).join(" · "))}</small></span><span class="chev">›</span></a>`).join("") || `<div class="card muted">${T("No hay ninguna competición con ese nombre.")}</div>`}</div></section>`;
  };
  box.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(draw, 200); });
}

// Universidad anfitriona a partir del nombre ("2026 Tennessee Invitational" → Tennessee).
function logoFor(team) {
  let info = logoIndex ? matchTeam(logoIndex, team) : null;
  if (!(info && info.logo) && uniIndex) {
    const u = matchTeam(uniIndex, team);
    if (u && u.logo) info = { ...u, color: info ? info.color : u.color };
  }
  return info && info.logo ? info : null;
}
function hostOf(name) {
  if ((!logoIndex && !uniIndex) || !name) return null;
  const words = name.replace(/\b(19|20)\d{2}\b/g, " ").replace(/[^\w&'(). -]/g, " ").split(/\s+/).filter(Boolean);
  for (let n = Math.min(4, words.length); n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const cand = words.slice(i, i + n).join(" ");
      if (cand.length < 3 || /^(the|of|and|invite|invitational|fall|winter|men'?s|women'?s|swimming|diving|championships?|meet|open|day)$/i.test(cand)) continue;
      const info = logoFor(cand);
      if (info) return { team: cand, info };
    }
  }
  return null;
}
function meetBadge(s, size = 36) {
  const sp = SPONSOR_WORDS.find(([re]) => re.test(s.name || ""))?.[1];
  if (sp && brands?.[sp]) return `<span class="org host" style="width:${size}px;height:${size}px"><img src="${esc(brands[sp])}" alt=""></span>`;
  if (s.org === "conf" || s.org === "dual") {
    const ck0 = CONF_WORDS.find(([re]) => re.test(s.name))?.[1];
    if (ck0 && brands?.[ck0] && /champ|conference|league/i.test(s.name)) return `<span class="org host" style="width:${size}px;height:${size}px"><img src="${esc(brands[ck0])}" alt=""></span>`;
    const hi = s.host && logoFor(s.host);
    const h = hi ? { team: s.host, info: hi } : hostOf(s.name);
    if (h) return `<span class="org host" style="width:${size}px;height:${size}px;--hc:${h.info.color}"><img src="${esc(h.info.logo)}" alt=""></span>`;
    const ck = CONF_WORDS.find(([re]) => re.test(s.name))?.[1];
    if (ck && brands?.[ck]) return `<span class="org host" style="width:${size}px;height:${size}px"><img src="${esc(brands[ck])}" alt=""></span>`;
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

// Buscador de pruebas dentro de una competición ("espalda", "200 estilos", "relevo mujeres"…), en español o inglés.
const EV_SYN = [
  [/free(style)?/i, "libre crol free freestyle"], [/back(stroke)?/i, "espalda back backstroke"], [/breast(stroke)?/i, "braza pecho breast breaststroke"],
  [/fly|butterfly/i, "mariposa fly butterfly"], [/\bIM\b|individual medley/i, "estilos im individual medley"], [/medley relay/i, "estilos medley"], [/relay/i, "relevo relevos relay"],
  [/diving|platform/i, "saltos trampolín diving"], [/\bwomen|girls|female/i, "mujeres femenino chicas women"], [/\bmen\b|boys|male/i, "hombres masculino chicos men"],
  [/yard/i, "yardas yards"], [/meter|metre/i, "metros meters"],
];
const foldTxt = (x) => (x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const evWords = (name) => foldTxt([name, englishToSpanish(name), ...EV_SYN.filter(([re]) => re.test(name)).map(([, w]) => w)].join(" "));
const evQuery = {};
function evSearchBox(id) {
  const q = evQuery[id] || "";
  const chips = [["Libre", "libre"], ["Espalda", "espalda"], ["Braza", "braza"], ["Mariposa", "mariposa"], ["Estilos", "estilos"], ["Relevo", "relevo"], ["Mujeres", "mujeres"], ["Hombres", "hombres"]];
  return `<div class="evsearch"><input id="evq" class="msearch" type="search" enterkeyhint="search" autocomplete="off" placeholder="🔎 ${esc(T("Buscar prueba: espalda, 200 estilos…"))}" value="${esc(q)}"><div class="chips">${chips.map(([l, k]) => `<button type="button" class="chip${q === k ? " on" : ""}" data-k="${k}">${esc(T(l))}</button>`).join("")}</div><p id="evnone" class="card muted" hidden>${T("Ninguna prueba coincide.")}</p></div>`;
}
function setupEvSearch(id) {
  const box = document.getElementById("evq");
  if (!box) return;
  const apply = () => {
    const words = foldTxt(box.value).split(/\s+/).filter(Boolean);
    evQuery[id] = box.value.trim();
    let shown = 0;
    for (const sess of document.querySelectorAll(".session")) {
      let n = 0;
      for (const row of sess.querySelectorAll(".erow")) { const ok = words.every((w) => row.dataset.q.includes(w)); row.hidden = !ok; if (ok) n++; }
      sess.hidden = !n;
      shown += n;
    }
    document.getElementById("evnone").hidden = shown > 0;
    for (const c of document.querySelectorAll(".evsearch .chip")) c.classList.toggle("on", foldTxt(box.value).trim() === c.dataset.k);
  };
  box.addEventListener("input", apply);
  for (const c of document.querySelectorAll(".evsearch .chip")) c.addEventListener("click", () => { box.value = foldTxt(box.value).trim() === c.dataset.k ? "" : c.dataset.k; apply(); });
  if (box.value) apply();
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
    body = (meet.sessions.some((x) => x.events.length) ? evSearchBox(id) : "") + meet.sessions
      .map(
        (s) => `<div class="session"><h3>${esc(s.title.replace("Session", T("Sesión")))}<span>${esc(fmtDay(s.day))}</span></h3>
        ${s.events.map((e) => `<a class="erow" data-ev="${esc(e.url)}" data-q="${esc(evWords(e.name))}" href="#/m/${enc(id)}/e/${enc(eventKey(e.url))}"><span class="num">${e.number}</span><span class="ename">${esc(englishToSpanish(e.name))}<small class="win"></small></span>${e.relay ? `<span class="tag">${T("Relevo")}</span>` : ""}<span class="chev">›</span></a>`).join("")}
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
    <div class="mtop">${meetBadge({ org: meet.org, name: meet.name, host: meet.host }, 60)}<div><h1>${esc(meet.name)}</h1><p>${esc(fmtRange(meet.start, meet.end))}${uniqueEvents(meet).length ? ` · ${uniqueEvents(meet).length} ${T("pruebas")}` : ""}</p>${live ? liveTag() : ""}</div></div>
    ${teams.length ? `<div class="strip">${teams.map((t) => `<a href="#/m/${enc(id)}/t/${enc(t)}" title="${esc(t)}">${crest(t, 40)}</a>`).join("")}</div>` : ""}
    ${standings && tab === "pruebas" && standings.scores[0] ? `<a class="leader" href="#/m/${enc(id)}/clasificacion">${crest(standings.scores[0].t, 28)}<span>${T("Lidera {t} con {p} pts", { t: `<b>${esc(standings.scores[0].t)}</b>`, p: esc(standings.scores[0].pts) })}</span><span class="chev">›</span></a>` : ""}
  </section>
  ${meetButtons(meet.name)}
  ${meet.src ? `<a class="article" href="${esc(meet.src)}" target="_blank" rel="noopener">📄 ${T("Resultados originales en la web de la universidad")} ↗</a>` : ""}
  ${(store.get("s:" + id) || {}).article ? `<a class="article" href="${esc(store.get("s:" + id).article)}" target="_blank" rel="noopener">${T("Crónica en SwimSwam")} ↗</a>` : ""}
  ${live && meet.lastEventUrl ? `<a class="lastev" href="#/m/${enc(id)}/e/${enc(eventKey(meet.lastEventUrl))}">⚡ ${T("Última prueba terminada")}</a>` : ""}
  <nav class="seg">${tabs.map(([k, l]) => `<a class="${k === tab ? "on" : ""}" href="#/m/${enc(id)}${k === "pruebas" ? "" : "/" + k}">${l}</a>`).join("")}</nav>
  ${body}`;
  if (tab === "pruebas") { fillWinners(meet, live); setupEvSearch(id); }
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
    if (ev.psych) {
      for (const row of document.querySelectorAll(`.erow[data-ev="${CSS.escape(url)}"]`)) if (ev.results.length) row.querySelector(".win").textContent = `📋 ${T("{n} inscritos · aún sin nadar", { n: ev.results.length })}`;
      return;
    }
    const w = ev.results.find((r) => r.p === "1" && (!r.s || /Final|Champ/i.test(r.s))) || ev.results.find((r) => r.p === "1");
    if (!w) return;
    for (const row of document.querySelectorAll(`.erow[data-ev="${CSS.escape(url)}"]`)) {
      row.querySelector(".num").insertAdjacentHTML("afterend", crest(w.t, 34));
      row.querySelector(".win").innerHTML = `🥇 ${esc(ev.relay ? w.t : w.n)} · <b class="convt" data-conv="${esc(w.m)}" data-ev="${esc(ev.title)}" role="button">${esc(w.m)}</b>`;
      row.classList.add("done");
    }
  });
}

// Busca al nadador de un resultado en la lista de nadadores (para su foto y su perfil).
let swByUni = null;
function findSwimmer(sw, name, team) {
  if (!sw?.length) return null;
  const low = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z\s'-]/g, "").trim();
  if (!swByUni) {
    swByUni = new Map();
    for (const x of sw) { const k = x.u ? x.u.n : low(x.t); if (!swByUni.has(k)) swByUni.set(k, []); swByUni.get(k).push(x); }
  }
  const full = name.includes(",") ? name.split(",").map((x) => x.trim()).filter(Boolean).reverse().join(" ") : name;
  const u = findUni(team);
  const list = swByUni.get(u ? u.n : low(team)) || [];
  const n = low(full), tk = n.split(/\s+/), last = name.includes(",") ? low(name.split(",")[0]).split(/[\s-]+/)[0] : tk[tk.length - 1], first = tk[0];
  return list.find((x) => low(x.n) === n) || list.find((x) => { const xt = low(x.n).split(/\s+/); return xt.slice(1).join(" ").split(/[\s-]+/).includes(last) && (xt[0].startsWith(first) || first.startsWith(xt[0])); }) || null;
}

function resultRow(r, relay, id, fav, sw, title) {
  const place = /^\d+$/.test(r.p) ? `<span class="place p${r.p}">${r.p}</span>` : `<span class="place dq">${esc(r.p)}</span>`;
  const extra = [];
  if (r.sw && r.sw.length) extra.push(`<div class="swimmers">${r.sw.map(esc).join(" · ")}</div>`);
  if (r.sp && r.sp.length) extra.push(`<div class="splits">${r.sp.map((s, i) => `<span><small>${(i + 1) * (r.sp.length > 8 ? 25 : 50)}</small>${esc(s)}</span>`).join("")}</div>`);
  const x = relay ? null : findSwimmer(sw, r.n, r.t);
  const pic = x?.img ? `<span class="rphoto"><img src="${esc(x.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('nophoto')"><i>${crest(r.t, 18)}</i></span>` : crest(r.t);
  const nm = esc(relay ? r.t + (r.l ? " " + r.l : "") : x ? x.n : r.n);
  return `<details class="rrow ${fav ? "fav" : ""}"><summary>
    ${place}${pic}
    <span class="who">${x ? `<a class="rname" href="#/n/${x.i}"><strong>${nm}</strong></a>` : `<strong>${nm}</strong>`}<small>${relay ? "" : esc(r.t) + (r.y ? " · " + esc(r.y) : "")}</small></span>
    <span class="time" data-conv="${esc(r.m)}" data-ev="${esc(title || "")}" role="button" title="${T("Convertir tiempo")}"><strong>${esc(r.m)}</strong>${r.pv && !/^(NT|NS|--)$/i.test(r.pv) ? `<small data-conv="${esc(r.pv)}" data-ev="${esc(title || "")}">${esc(r.pv)}</small>` : ""}${r.pts ? `<em>${esc(r.pts)} pts</em>` : ""}</span>
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
  const sw = await loadSwimmers().catch(() => []);
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
      return h + resultRow(r, ev.relay, id, isFav(r.t, f), sw, ev.title);
    })
    .join("");
  $app.innerHTML = `
  <a class="back" href="#/m/${enc(id)}">‹ ${esc(meet.name)}</a>
  <section class="ehead"><span class="num big">${ev.number ?? ""}</span><div><h1>${esc(englishToSpanish(ev.title))}</h1><p class="sub">${meet.status === "live" ? liveTag() : esc(fmtRange(meet.start, meet.end))}</p></div></section>
  ${ev.psych ? `<div class="card muted">📋 ${T("Aún no hay resultados de esta prueba. Esta es la lista de inscritos con su marca de inscripción; se actualizará sola cuando la publiquen.")}</div>` : ""}
  ${f.size ? `<label class="toggle"><input type="checkbox" id="onlyFav" ${onlyFav ? "checked" : ""}> ${T("Solo mis universidades")}</label>` : ""}
  ${ev.records.length ? `<details class="records"><summary>${T("Récords")}</summary>${ev.records.map((r) => `<div>${esc(r).replace(/\b((?:\d{1,2}:)?\d{1,2}\.\d{2})\b/g, `<b class="convt" data-conv="$1" data-ev="${esc(ev.title)}" role="button">$1</b>`)}</div>`).join("")}</details>` : ""}
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
  <div class="list">${rows.map(({ ev, r }) => `<a class="trow" href="#/m/${enc(id)}/e/${enc(eventKey(ev.url))}"><span class="place p${r.p}">${esc(r.p)}</span><span class="who"><strong>${esc(ev.relay ? "Relevo " + (r.l || "") : r.n)}</strong><small>${esc(englishToSpanish(ev.title))}${r.s ? " · " + esc(SECTION_ES[r.s] || r.s) : ""}</small></span><span class="time" data-conv="${esc(r.m)}" data-ev="${esc(ev.title)}" role="button"><strong>${esc(r.m)}</strong>${r.pts ? `<em>${esc(r.pts)} pts</em>` : ""}</span></a>`).join("") || `<div class="card muted">${T("Sin resultados todavía.")}</div>`}</div>`;
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
  const flt = { div: "", conf: "", st: "", sex: "", q: "", sort: "rank", fav: "", ...store.get("uniFilters", {}) };
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
        (!flt.fav || [...f].some((t) => sameTeam(t, u.n))) &&
        (!ql || [u.n, u.full, u.nick, u.city].some((x) => x && x.toLowerCase().includes(ql)))
    );
    document.getElementById("fbar").innerHTML = `
      <div class="frow">${chip("div", "", T("Todas"))}${DIVS.map(([k]) => chip("div", k, k === "NAIA" ? "NAIA" : k.replace("D", "D-"))).join("")}</div>
      <div class="frow">${chip("sex", "", T("Todos"))}${chip("sex", "m", T("Hombres"))}${chip("sex", "w", T("Mujeres"))}</div>
      <div class="frow">${chip("fav", "", T("Todas"))}${chip("fav", "1", "★ " + T("Mis favoritas"))}</div>
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
      (f.size && !ql && !flt.div && !flt.conf && !flt.st && !flt.sex && !flt.fav ? `<h2>${T("Mis universidades")}</h2><div class="grid">${[...f].map((t) => `<a class="tcard" href="#/uni/${enc(t)}">${crest(t, 48)}<span>${esc(t)}</span>${star(t)}</a>`).join("")}</div>` : "") +
      (groups.length
        ? groups.map(([label, l]) => `<h2>${esc(label)} <span class="count">${l.length}</span></h2><div class="list">${l.slice(0, 700).map(row).join("")}</div>`).join("")
        : `<div class="card muted">${flt.fav ? T("Aún no tienes universidades favoritas. Toca ☆ en cualquiera para guardarla.") : T("Ninguna universidad con estos filtros.")}</div>`);
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
// ── Ranking de la temporada y tiempos del equipo (web/data/equipos-rank.json y equipos/<equipo>.json) ──
const NCAA_EVS = ["50 Y Free", "100 Y Free", "200 Y Free", "500 Y Free", "1000 Y Free", "1650 Y Free", "100 Y Back", "200 Y Back", "100 Y Breast", "200 Y Breast", "100 Y Fly", "200 Y Fly", "200 Y IM", "400 Y IM"];
const CH_PTS = [20, 17, 16, 15, 14, 13, 12, 11, 9, 7, 6, 5, 4, 3, 2, 1];
const tSecs = (t) => { const m = /^(?:(\d+):)?(\d+\.\d+)/.exec(t || ""); return m ? (+m[1] || 0) * 60 + +m[2] : Infinity; };
const teamSlug = (t) => norm(t).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";
const STROKE_ES = { Free: "Libre", Back: "Espalda", Breast: "Braza", Fly: "Mariposa", IM: "Estilos" };
const evLabel = (ev) => { const [d, c, s] = ev.split(" "); return `${d} ${T(STROKE_ES[s] || s)}${c === "M" ? " · " + T("piscina larga") : ""}`; };
let seasonData = null;
async function loadSeason() {
  if (seasonData) return seasonData;
  await loadUnis();
  const d = await loadData("equipos-rank");
  const byUni = new Map();
  for (const [slug, [raw, best]] of Object.entries(d?.t || {})) {
    const u = findUni(raw);
    if (!u) continue;
    const x = byUni.get(u) || { slugs: [], M: {}, W: {} };
    x.slugs.push(slug);
    for (const g of ["M", "W"]) for (const [ev, ts] of Object.entries(best[g] || {})) x[g][ev] = [...(x[g][ev] || []), ...ts.map(tSecs)].sort((a, b) => a - b).slice(0, 3);
    byUni.set(u, x);
  }
  return (seasonData = { byUni, updated: d?.updated || "", season: d?.season || "" });
}
// Puntuación como un campeonato: los 3 mejores de cada equipo en cada prueba, 20-17-16…1 a los 16 primeros.
function rankTeams(list, g, byUni) {
  const pts = new Map();
  for (const u of list) if (byUni.get(u) && Object.keys(byUni.get(u)[g]).length) pts.set(u, 0);
  for (const ev of NCAA_EVS) {
    const swims = [];
    for (const u of pts.keys()) for (const s of byUni.get(u)[g][ev] || []) if (s < Infinity) swims.push([s, u]);
    swims.sort((a, b) => a[0] - b[0]).slice(0, 16).forEach(([, u], i) => pts.set(u, pts.get(u) + CH_PTS[i]));
  }
  return [...pts].sort((a, b) => b[1] - a[1] || a[0].n.localeCompare(b[0].n)).map(([u, p], i) => ({ u, p, pos: i + 1 }));
}
const CONF_NAMES = { MVC: "Missouri Valley", ASUN: "ASUN", MPSF: "Mountain Pacific", CAA: "Coastal Athletic", NEC: "Northeast", A10: "Atlantic 10", MW: "Mountain West", RMAC: "Rocky Mountain", NE10: "Northeast-10", GLIAC: "Great Lakes (GLIAC)", NSIC: "Northern Sun", PCSC: "Pacific Collegiate", PSAC: "Pennsylvania (PSAC)", NSISC: "Northern Sun", GLVC: "Great Lakes Valley", SSC: "Sunshine State", GNAC: "Great Northwest", NESCAC: "NESCAC", CCIW: "CCIW", SCAC: "Southern Collegiate", SCIAC: "SCIAC", NEWMAC: "NEWMAC", ODAC: "Old Dominion", SAA: "Southern Athletic", UAA: "University Athletic", CUNYAC: "CUNY", SUNYAC: "SUNY", AEC: "America East", ARC: "American Rivers", NJAC: "New Jersey (NJAC)", NCAC: "North Coast", NAC: "North Atlantic", PAC: "Presidents' (PAC)", ISC: "Independent Swimming", E8: "Empire 8", MSC: "Mid-South", SCSC: "Sooner (SCSC)", KCAC: "Kansas (KCAC)" };
const confName = (c) => CONF_NAMES[c] || c;
const confOf = (u, g) => (g === "M" ? u.cm : u.cw) || u.cw || u.cm || "";
const inGroup = (kind, key, g) => (u) => (g === "M" ? u.men : u.women) && (kind === "div" ? u.div === key : confOf(u, g) === key);
const confLogo = (c, size = 18) => { const k = CONF_WORDS.find(([re]) => re.test(c || ""))?.[1]; const img = k && brands?.[k]; return img ? `<img class="conflogo" src="${esc(img)}" alt="" width="${size}" height="${size}" onerror="this.remove()">` : ""; };
const uniTint = (u) => { const info = logoIndex ? matchTeam(logoIndex, u.n) || matchTeam(logoIndex, u.full) : null; return info && info.color && info.color !== "#0b63ce" ? info.color : "#0b3d91"; };

async function rankView(kind, key, g) {
  setTab("unis");
  loading();
  await Promise.all([loadLogos().catch(() => {}), loadBrands().catch(() => {})]);
  const { byUni, updated } = await loadSeason();
  g = g === "W" ? "W" : "M";
  const title = kind === "div" ? divLabel(key) : confName(key);
  setTitle(title);
  const all = unis.filter(inGroup(kind, key, g));
  const ranked = rankTeams(all, g, byUni);
  const top = ranked[0]?.p || 1;
  const missing = all.filter((u) => !ranked.some((r) => r.u === u));
  const base = `#/rank/${kind}/${enc(key)}`;
  const row = (r) => `<a class="rkrow" href="#/uni/${enc(r.u.n)}"><span class="rkpos ${r.pos <= 3 ? "p" + r.pos : ""}">${r.pos}</span>${crest(r.u.n, 34)}<span class="uinfo"><b>${esc(r.u.n)}</b><span class="rkbar"><i style="width:${Math.max(4, (r.p / top) * 100).toFixed(1)}%"></i></span></span><span class="rkpts"><b>${r.p}</b><small>pts</small></span></a>`;
  $app.innerHTML = `
  <a class="back" href="javascript:history.back()">‹ ${T("Atrás")}</a>
  <section class="ghero">
    <div class="ghead">${kind === "conf" ? `<span class="gico">${confLogo(key, 44) || "🏆"}</span>` : `<span class="gico txt">${esc(key === "NAIA" ? "NAIA" : key.replace("D", "D-"))}</span>`}<div><small>${T("Ranking de la temporada")}</small><h1>${esc(title)}</h1><p>${T("{n} equipos", { n: all.length })}</p></div></div>
  </section>
  <nav class="seg"><a href="${base}/M" class="${g === "M" ? "on" : ""}">♂ ${T("Chicos")}</a><a href="${base}/W" class="${g === "W" ? "on" : ""}">♀ ${T("Chicas")}</a></nav>
  ${ranked.length ? `<div class="glist">${ranked.map(row).join("")}</div>` : `<div class="card muted">${T("Aún no hay tiempos de esta temporada para estos equipos.")}</div>`}
  ${missing.length ? `<h2>${T("Sin tiempos esta temporada")} <span class="count">${missing.length}</span></h2><div class="glist">${missing.map((u) => `<a class="rkrow dim" href="#/uni/${enc(u.n)}"><span class="rkpos">–</span>${crest(u.n, 30)}<span class="uinfo"><b>${esc(u.n)}</b></span><span class="chev">›</span></a>`).join("")}</div>` : ""}
  <p class="foot">${T("Ranking orientativo calculado con los 3 mejores tiempos de cada equipo en cada prueba individual de yardas esta temporada, puntuando como un campeonato (20, 17, 16… a los 16 primeros).")}${updated ? ` ${T("Actualizado")}: ${esc(updated)}.` : ""}</p>`;
}

async function uniView(name, tab = "") {
  setTab("unis");
  loading();
  await Promise.all([loadLogos().catch(() => {}), loadBrands().catch(() => {})]);
  const u = unis.find((x) => x.n === name) || findUni(name);
  if (!u) return errorView("Universidad no encontrada.");
  setTitle(u.n);
  const tint = uniTint(u);
  const confs = u.cm && u.cw && u.cm !== u.cw ? [u.cm, u.cw] : [u.cw || u.cm].filter(Boolean);
  const hero = `
  <a class="back" href="#/u">‹ ${T("Universidades")}</a>
  <section class="uhero2" style="--tint:${tint}">
    <div class="uh-top"><span class="uh-crest">${crest(u.n, 72)}</span>${star(u.n)}</div>
    <h1>${esc(u.n)}</h1>
    <p class="uh-sub">${esc(u.nick || u.full)}${place(u) ? ` · 📍 ${esc(place(u))}` : ""}</p>
    <div class="uh-chips"><a class="gchip" href="#/rank/div/${enc(u.div)}/${u.women ? "W" : "M"}">${esc(divLabel(u.div))}</a>${confs.map((c) => `<a class="gchip" href="#/rank/conf/${enc(c)}/${c === u.cw && u.women ? "W" : "M"}">${confLogo(c, 16)}${esc(confName(c))}</a>`).join("")}</div>
  </section>
  <nav class="seg useg"><a href="#/uni/${enc(u.n)}" class="${tab ? "" : "on"}">🏊 ${T("Natación")}</a><a href="#/uni/${enc(u.n)}/info" class="${tab ? "on" : ""}">🏛️ ${T("Universidad")}</a></nav>`;
  if (tab === "info") return uniInfoView(u, hero);
  const [ranks, sw, calD, meets, season] = await Promise.all([loadRanks().catch(() => new Map()), loadSwimmers().catch(() => []), loadData("calendario"), loadArchiveRaw().catch(() => []), loadSeason().catch(() => null), loadResIndex().catch(() => null)]);
  const games = calD?.cal?.[u.n] || [];
  const r = ranks.get(u);
  const team = sw.filter((x) => x.u === u);
  const fact = (label, value) => (value ? `<div class="fact"><small>${esc(label)}</small><b>${esc(value)}</b></div>` : "");
  const web = hrefOk(u.web);
  const ncaaRow = (g, label) => {
    const x = r?.[g];
    if (!x) return `<div class="nrow"><span>${label}</span><b class="muted">${ranks.partial?.has(u.div + g) ? T("Solo se publican campeón y subcampeón") : T("No puntuó")}</b></div>`;
    const medal = x.p <= 3 ? ["🥇", "🥈", "🥉"][x.p - 1] : "🏅";
    return `<div class="nrow"><span>${label}</span><b>${medal} ${ord(x.p)} <small>${x.of ? T("de {n}", { n: x.of }) + " · " : ""}${esc(x.pts)} pts</small></b></div>`;
  };
  const year = r?.M?.year || r?.W?.year || "";
  const staff = [...(u.staff || [])];
  const bios = await loadBio(u.n);
  for (const n of Object.keys(bios?.c || {})) if (!staff.some((p) => nameKey(p.n) === nameKey(n))) staff.push({ n, t: (bios.c[n].f || []).find(([l]) => l === "Cargo")?.[1] || T("Entrenador") });
  const staffHtml = staff.length
    ? `<div class="list staff">${staff
        .map((p) => { const b = findBio(bios?.c, p.n); return `<a class="srow" href="#/coach/${enc(u.n)}/${enc(p.n)}">${b?.img ? `<img class="face" src="${esc(b.img)}" alt="" width="44" height="44" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">` : `<span class="avatar">${esc(initials(p.n))}</span>`}<span class="uinfo"><b>${esc(p.n)} ${flagHtml(b)}</b><small>${esc(p.t)}${p.g ? ` · ${p.g === "M" ? T("Hombres") : T("Mujeres")}` : ""}</small>${b?.b ? `<small class="biolink">Bio ›</small>` : ""}</span><span class="chev">›</span></a>`; })
        .join("")}</div>`
    : `<div class="card muted">${T("Esta universidad no publica su equipo técnico en un formato que se pueda leer.")}${u.staffUrl || web ? ` <a href="${esc(u.staffUrl || web)}" target="_blank" rel="noopener">${T("Ver en su web")} ↗</a>` : ""}</div>`;
  const yr = (y) => ({ FR: T("1º año"), SO: T("2º año"), JR: T("3º año"), SR: T("4º año"), GR: T("Posgrado"), "5Y": T("5º año") }[y] || "");
  const top = (x) => (x.top ? [x.top[0], [x.top[1]]] : Object.entries(x.b)[0]);
  const row = (x) => { const bi = findBio(bios?.p, x.rf || x.n); return `<a class="urow" href="#/n/${x.i}">${face(x.img || !bi?.img ? x : { ...x, img: bi.img })}<span class="uinfo"><b>${esc(x.n)} ${flagHtml(bi, x)}</b><small>${esc([yr(x.y), top(x) ? `${top(x)[0]} ${top(x)[1][0]}` : ""].filter(Boolean).join(" · "))}</small></span><span class="chev">›</span></a>`; };
  const squad = (g, label) => {
    const list = team.filter((x) => (x.g || "") === g).sort((a, b) => a.n.localeCompare(b.n));
    if (!list.length) return "";
    const faces = list.filter((x) => x.img).slice(0, 5).map((x) => `<img src="${esc(x.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`).join("");
    return `<details class="squad ${g === "W" ? "w" : g === "M" ? "m" : ""}"><summary><span class="sqicon">${g === "W" ? "♀" : g === "M" ? "♂" : "🏊"}</span><span class="sqname"><b>${label}</b><small>${list.length} ${T("nadadores")}</small></span><span class="sqfaces">${faces}</span><span class="sqarrow">›</span></summary><div class="list">${list.map(row).join("")}</div></details>`;
  };
  const teamHtml = team.length
    ? squad("M", T("Equipo masculino")) + squad("W", T("Equipo femenino")) + squad("", T("Otros nadadores"))
    : `<div class="card muted">${T("Aún no hay nadadores de esta universidad en los resultados guardados de esta temporada.")}</div>`;
  // Chicos / chicas: un solo selector para el ranking y los tiempos del equipo.
  const sexes = [u.men && "M", u.women && "W"].filter(Boolean);
  let g = store.get("uniSex", "W");
  if (!sexes.includes(g)) g = sexes[0] || "W";
  $app.innerHTML = `${hero}
  ${nowSection(u, games, meets)}
  <div class="ghead2"><h2>${T("Ranking de la temporada")}</h2>${sexes.length > 1 ? `<div class="mini-seg" id="sexsel">${sexes.map((s) => `<button data-g="${s}">${s === "M" ? T("Chicos") : T("Chicas")}</button>`).join("")}</div>` : ""}</div>
  <div class="rkcards" id="rkcards"></div>
  <div class="ghead2"><h2>${T("Tiempos del equipo")}</h2><select id="evsel" class="gselect"></select></div>
  <div id="ttimes"></div>
  <h2>🏆 ${T("Últimos campeonatos nacionales")} ${year ? `<span class="count">${esc(year)}</span>` : ""}</h2>
  <div class="card ncaa">${u.men ? ncaaRow("M", "♂ " + T("Hombres")) : ""}${u.women ? ncaaRow("W", "♀ " + T("Mujeres")) : ""}</div>
  <h2>🏊 ${T("Nadadores")} ${team.length ? `<span class="count">${team.length}</span>` : ""}</h2>
  ${teamHtml}
  <a class="btn wide" href="#/u/${enc(u.n)}">🏊 ${T("Ver sus resultados")}</a>
  ${u.hytek ? `<a class="btn wide alt" href="#/m/${enc(`https://www.sidearmstats.com/${u.hytek}/swim/evtindex.htm`)}">⏱️ ${T("Su última competición en casa")}</a>` : ""}
  ${games.length ? `<h2>📅 ${T("Calendario y resultados")} <span class="count">${games.length}</span></h2><div class="list">${games.map((x) => gameRow(u.n, x)).join("")}</div>` : ""}
  ${storedSection(u)}
  <h2>👥 ${T("Equipo técnico y contacto")} ${staff.length ? `<span class="count">${staff.length}</span>` : ""}</h2>
  ${staffHtml}
  ${extButtons([[SC_TEAM(u.full || u.n), "SwimCloud", "sc"], [USAS_SWIMMER(u.full || u.n), "USA Swimming", "usas"]])}
  <p class="foot">${T("Nadadores sacados de los resultados públicos de esta temporada y de los últimos NCAA. Datos de Wikipedia (CC BY-SA), Wikidata y la web oficial de la universidad.")}</p>`;
  // Tiempos del equipo: une los nombres con que sale la universidad en los resultados.
  const mine = season?.byUni.get(u);
  const files = await Promise.all((mine?.slugs || []).map((s) => loadData("equipos/" + s).catch(() => null)));
  const times = { M: {}, W: {} };
  for (const f of files) if (f) for (const s of ["M", "W"]) for (const [ev, list] of Object.entries(f[s] || {})) times[s][ev] = [...(times[s][ev] || []), ...list];
  for (const s of ["M", "W"]) for (const ev of Object.keys(times[s])) {
    const seen = new Set();
    times[s][ev] = times[s][ev].sort((a, b) => tSecs(a[0]) - tSecs(b[0])).filter(([, n]) => !seen.has(n) && seen.add(n)).slice(0, 10);
  }
  const swByName = new Map(team.map((x) => [nameKey(x.n), x]));
  const findSw = (n) => swByName.get(nameKey(n.replace(/\s+[A-Z]\.?(?=\s)/g, "")));
  const paint = () => {
    for (const b of document.querySelectorAll("#sexsel button")) b.classList.toggle("on", b.dataset.g === g);
    const cards = [];
    if (season) {
      const one = (kind, key, label, ico) => {
        const list = unis.filter(inGroup(kind, key, g));
        const rk = rankTeams(list, g, season.byUni);
        const me = rk.find((x) => x.u === u);
        return `<a class="rkcard" href="#/rank/${kind}/${enc(key)}/${g}"><span class="rkico">${ico}</span><b>${me ? "#" + me.pos : "–"}</b><span>${esc(label)} ›</span><small>${me ? T("{p} pts · de {n}", { p: me.p, n: rk.length }) : T("Sin tiempos aún")}</small></a>`;
      };
      cards.push(one("div", u.div, divLabel(u.div), `<span class="gico txt sm">${esc(u.div === "NAIA" ? "NAIA" : u.div.replace("D", "D-"))}</span>`));
      const c = confOf(u, g);
      if (c) cards.push(one("conf", c, confName(c), confLogo(c, 26) || "🏆"));
    }
    document.getElementById("rkcards").innerHTML = cards.join("");
    const evs = Object.keys(times[g]).sort((a, b) => evOrder(a) - evOrder(b));
    const sel = document.getElementById("evsel");
    let ev = sel.value && evs.includes(sel.value) ? sel.value : evs.includes(store.get("uniEv", "")) ? store.get("uniEv", "") : evs.find((e) => e === "100 Y Free") || evs[0];
    sel.innerHTML = evs.map((e) => `<option value="${esc(e)}" ${e === ev ? "selected" : ""}>${esc(evLabel(e))}</option>`).join("");
    sel.style.display = evs.length ? "" : "none";
    const list = times[g][ev] || [];
    document.getElementById("ttimes").innerHTML = list.length
      ? `<div class="glist">${list.map(([t, n], i) => { const x = findSw(n); const inner = `<span class="rkpos ${i < 3 ? "p" + (i + 1) : ""}">${i + 1}</span>${x ? face(x) : `<span class="avatar">${esc(initials(n))}</span>`}<span class="uinfo"><b>${esc(x?.n || n)}</b><small>${esc(evLabel(ev))}</small></span><span class="ttime">${esc(t)}</span>`; return x ? `<a class="rkrow" href="#/n/${x.i}">${inner}</a>` : `<div class="rkrow">${inner}</div>`; }).join("")}</div>`
      : `<div class="card muted">${T("Aún no hay tiempos de esta temporada para este equipo.")}</div>`;
  };
  document.getElementById("sexsel")?.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; g = b.dataset.g; store.set("uniSex", g); paint(); });
  document.getElementById("evsel").onchange = (e) => { store.set("uniEv", e.target.value); paint(); };
  paint();
}

async function uniInfoView(u, hero) {
  const inst = (await loadData("instalaciones").catch(() => null))?.u?.[u.n] || {};
  const f = inst.fac;
  const web = hrefOk(u.web);
  const ddg = (q) => "https://duckduckgo.com/?q=" + enc("\\" + q);
  const lrow = (href, ico, label, sub) => (href ? `<a class="lrow" href="${esc(href)}" target="_blank" rel="noopener"><span class="lico">${ico}</span><span class="uinfo"><b>${label}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span><span class="chev">›</span></a>` : "");
  const yes = (v) => (v ? `<b class="ok">✓ ${T("Sí")}</b>` : `<b class="muted">—</b>`);
  const prow = (label, val) => `<div class="prow"><span>${label}</span>${val}</div>`;
  const video = `<a class="vcard ph" style="--tint:${uniTint(u)}" href="https://www.youtube.com/results?search_query=${enc((u.full || u.n) + " campus tour")}" target="_blank" rel="noopener"><span class="play">▶</span><b>${T("Ver el campus en vídeo")}</b><small>${esc(u.full || u.n)}</small></a>`;
  const poolVideo = inst.yt ? `<div class="vcard pv"><iframe src="https://www.youtube-nocookie.com/embed/${esc(inst.yt)}" title="${esc(f?.n || u.n)}" loading="lazy" allow="encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>` : "";
  const fact = (label, value) => (value ? `<div class="fact"><small>${esc(label)}</small><b>${esc(value)}</b></div>` : "");
  const cfact = (label, value) => (value ? `<div class="fact"><small>${esc(label)}</small><b>${confLogo(value)}${esc(value)}</b></div>` : "");
  const coachLine = u.coach ? fact(T("Entrenador principal"), u.coach) : fact(T("Entrenador (hombres)"), u.coachM) + fact(T("Entrenador (mujeres)"), u.coachW);
  $app.innerHTML = `${hero}
  <h2>${T("Conócela")}</h2>
  ${video}
  <div class="glist links2">
    ${lrow(f?.url || ddg(`${u.full || u.n} swimming pool aquatic center`), "🏊", T("Instalaciones de natación"), f?.n || "")}
    ${lrow(inst.ig ? `https://www.instagram.com/${inst.ig}/` : ddg(`${u.full || u.n} swimming diving instagram site:instagram.com`), "📸", T("Instagram del equipo"), inst.ig ? "@" + inst.ig : "")}
    ${inst.igAll && !inst.ig ? lrow(`https://www.instagram.com/${inst.igAll}/`, "📷", T("Instagram de deportes"), "@" + inst.igAll) : ""}
    ${lrow(web, "🌐", T("Web de natación"), web.replace(/^https?:\/\/(www\.)?/, ""))}
    ${lrow(hrefOk(u.uweb), "🎓", T("Web de la universidad"), (u.uweb || "").replace(/^https?:\/\/(www\.)?/, ""))}
    ${lrow(u.rosterUrl || u.rosterWUrl || u.rosterMUrl, "📋", T("Plantilla oficial"), "")}
    ${lrow(u.wiki, "📖", "Wikipedia", "")}
  </div>
  <h2>${T("Piscina")}</h2>
  ${f ? `<div class="pcard">${f.img ? `<img class="pimg" src="${esc(f.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}<div class="pbody"><b class="pname">${esc(f.n)}</b>
    ${prow(T("Piscina de 25 yardas"), yes(f.y25))}
    ${prow(T("Piscina de 50 metros"), yes(f.m50))}
    ${f.m25 ? prow(T("Piscina de 25 metros"), yes(1)) : ""}
    ${f.lanes ? prow(T("Carriles"), `<b>${f.lanes}</b>`) : ""}
    ${prow(T("Foso de saltos"), yes(f.dive || u.diving))}
    ${f.seats ? prow(T("Aforo"), `<b>${f.seats.toLocaleString(lang() === "en" ? "en-US" : "es-ES")}</b>`) : ""}
    ${f.year ? prow(T("Inaugurada"), `<b>${f.year}</b>`) : ""}
    ${f.gal ? prow(T("Litros de agua"), `<b>${esc(f.gal)} ${T("galones")}</b>`) : ""}
    <a class="plink" href="${esc(f.url)}" target="_blank" rel="noopener">${T("Más sobre la piscina")} ↗</a></div></div>${poolVideo}`
    : `<div class="pcard"><div class="pbody">${prow(T("Equipo de saltos"), yes(u.diving))}<p class="muted small">${T("La universidad no publica los datos de su piscina en un formato que se pueda leer.")} <a href="${esc(ddg(`${u.full || u.n} aquatic center`))}" target="_blank" rel="noopener">${T("Buscarla")} ↗</a></p></div></div>`}
  <h2>${T("Datos")}</h2>
  <div class="facts">
    ${fact(T("Nombre completo"), u.full)}
    ${fact(T("Apodo"), u.nick)}
    ${fact(T("División"), divLabel(u.div))}
    ${u.cm && u.cm === u.cw ? cfact(T("Conferencia"), u.cm) : cfact(`${T("Conferencia")} · ${T("Hombres")}`, u.cm) + cfact(`${T("Conferencia")} · ${T("Mujeres")}`, u.cw)}
    ${fact(T("Ciudad"), place(u))}
    ${fact(T("Equipos"), [u.men && T("Hombres"), u.women && T("Mujeres"), u.diving && T("Saltos")].filter(Boolean).join(" · "))}
    ${coachLine}
    ${u.email ? `<div class="fact"><small>${T("Correo de la universidad")}</small><b><a href="mailto:${esc(u.email)}">${esc(u.email)}</a></b></div>` : ""}
  </div>
  <p class="foot">${T("Datos de la web oficial de deportes de la universidad, Wikipedia (CC BY-SA) y Wikidata.")}</p>`;
}

// Botones que abren SwimCloud y USA Swimming ya buscando lo que estás viendo (sin copiar enlaces).
const SC = (q) => "https://www.swimcloud.com/search/?q=" + enc(q);
// Salto directo a la ficha exacta de SwimCloud: el buscador abre su primer resultado (no leemos nada de SwimCloud).
const JUMP = (k, q) => `/api/sc?k=${k}&q=${enc(q)}`;
const SC_SWIMMER = (name, uni) => JUMP("swimmer", `${name} ${uni || ""}`.trim());
const SC_TEAM = (uni) => JUMP("team", uni);
const SC_MEET = (name, year) => JUMP("meet", `${name} ${year || ""}`.trim());
const USAS_MEET = (q) => "https://data.usaswimming.org/datahub/usas/meetsearch?query=" + enc(q);
const USAS_SWIMMER = (q) => "https://data.usaswimming.org/datahub/usas/individualsearch?query=" + enc(q);
// Meet Mobile no tiene web por competición: abre la app (o su tienda) y deja copiado el nombre para buscarlo.
const MM = () => (/android/i.test(navigator.userAgent) ? "https://play.google.com/store/apps/details?id=com.active.aps.meetmobile" : "https://apps.apple.com/us/app/meet-mobile/id422154977");
function extButtons(items) {
  return `<div class="ext">${items.map(([href, label, cls, copy]) => `<a class="extbtn ${cls}" href="${esc(href)}" target="_blank" rel="noopener"${copy ? ` data-copy="${esc(copy)}"` : ""}>${label} ↗</a>`).join("")}</div>`;
}
document.addEventListener("click", (e) => {
  const a = e.target.closest?.("a[data-copy]");
  if (a) try { navigator.clipboard?.writeText(a.dataset.copy); } catch {}
});
const meetButtons = (name) => {
  const q = name.replace(/\b(19|20)\d{2}\b/g, "").trim();
  return extButtons([[SC_MEET(q, name.match(/\b(19|20)\d{2}\b/)?.[0] || todayUS().slice(0, 4)), "SwimCloud", "sc"], [USAS_MEET(q), "USA Swimming", "usas"], [MM(), "Meet Mobile", "mm", q]]);
};
const words = (t) => new Set(String(t || "").toLowerCase().replace(/\b(19|20)\d{2}\b/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !/^(the|and|invitational|invite|meet|vs|swimming|diving|swim|dive|university|college|womens|mens|women|men)$/.test(w)));
// Busca en las competiciones guardadas la que corresponde a una fecha del calendario de la universidad.
function findMeetFor(u, g, meets) {
  if (!g.d) return null;
  const near = (m) => m.start && Math.abs((Date.parse(m.start) - Date.parse(g.d)) / 864e5) <= 3;
  const mine = words(u.n), opp = words(g.o);
  let best = null, bestScore = 0;
  for (const m of meets) {
    if (!near(m)) continue;
    const w = words(m.name);
    let sc = 0;
    for (const x of opp) if (w.has(x)) sc += 2;
    for (const x of mine) if (w.has(x)) sc += 1;
    if (m.host && (sameTeam(m.host, u.n) || sameTeam(m.host, g.o))) sc += 3;
    if (sc > bestScore) { best = m; bestScore = sc; }
  }
  return bestScore >= 2 ? best : null;
}
function nowSection(u, games, meets, sx = null) {
  const today = todayUS();
  // En la ficha de un nadador: solo las competiciones de su equipo (masculino o femenino).
  if (sx) games = games.filter((g) => !g.g || !sx.g || g.g === sx.g);
  const add = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10);
  // Competición de hoy, o empezada hace 1-3 días sin resultado final (los invitationals duran varios días).
  const hosted = meets.filter((m) => m.status === "live" && m.host && sameTeam(m.host, u.n));
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const endOf = (g) => {
    const all = [...String(g.dt || "").matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? (\d{1,2})\b/gi)];
    if (all.length < 2) return "";
    const [, mo, dd] = all[all.length - 1];
    const m = MON[mo.toLowerCase()], y = +g.d.slice(0, 4) + (m < +g.d.slice(5, 7) ? 1 : 0);
    return `${y}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  };
  const base = (o) => o.replace(/\s*\((day|session|prelims|finals)[^)]*\)/gi, "").trim().toLowerCase();
  const seen = new Set();
  const cur = games.filter((g) => {
    if (!g.d || g.d > today || g.d < add(today, -4)) return false;
    const end = endOf(g);
    const on = end ? end >= today : g.d === today || (g.d >= add(today, -2) && (!g.r || /day|session|prelim/i.test(g.r)));
    if (!on || seen.has(base(g.o) + g.g)) return false;
    seen.add(base(g.o) + g.g);
    return true;
  });
  const past = games.filter((g) => g.d && g.d < today && !cur.includes(g) && !seen.has(base(g.o) + g.g));
  const next = games.find((g) => g.d && g.d > today && !seen.has(base(g.o) + g.g));
  const last = past[past.length - 1];
  const card = (g, label, cls) => {
    const m = findMeetFor(u, g, meets);
    const rid = resIdOf(g.res) || resIdOf(g.live);
    const href = rid ? `#/m/${enc(rid)}` : g.live ? `#/m/${enc(normalizeMeetUrl(g.live))}` : m ? `#/m/${enc(m.id)}` : "";
    const ext = g.res || g.recap;
    const when = g.d ? fmtDate(g.d) : g.dt || "";
    const name = m?.name || g.o;
    return `<div class="nowcard ${cls}"><div class="nowlabel">${cls === "live" ? liveTag() : ""}${label}</div>
      <div class="nowmain">${crest(g.o, 40)}<div><b>${g.at === "at" ? "@ " : "vs "}${esc(g.o)}</b><small>${esc([when, g.g === "M" ? "♂ " + T("Hombres") : g.g === "W" ? "♀ " + T("Mujeres") : ""].filter(Boolean).join(" · "))}</small>${g.r ? `<span class="res ${/^W\b/i.test(g.r) ? "w" : /^L\b/i.test(g.r) ? "l" : ""}">${esc(g.r)}</span>` : ""}</div></div>
      ${href ? `<a class="btn wide" href="${esc(href)}">⏱️ ${T("Ver resultados aquí")}</a>` : ""}${ext ? `<a class="btn wide alt" href="${esc(ext)}" target="_blank" rel="noopener">📰 ${T("Ver en la web de la universidad")} ↗</a>` : ""}
      ${meetButtons(name)}</div>`;
  };
  const hostCard = (m) => `<div class="nowcard live"><div class="nowlabel">${liveTag()}${T("Compitiendo ahora")}</div><div class="nowmain">${crest(u.n, 40)}<div><b>${esc(m.name)}</b><small>${esc(fmtRange(m.start, m.end))} · ${T("en casa")}</small></div></div><a class="btn wide" href="#/m/${enc(m.id)}">⏱️ ${T("Ver resultados aquí")}</a>${meetButtons(m.name)}</div>`;
  const parts = [];
  for (const g of cur) parts.push(card(g, T("Compitiendo ahora"), "live"));
  for (const m of hosted) if (!cur.some((g) => findMeetFor(u, g, [m]))) parts.push(hostCard(m));
  if (sx) {
    if (!parts.length && !next) return "";
    const note = parts.length ? `<p class="sub pad">${T("Su universidad está compitiendo ahora: es probable que {n} esté nadando aquí.", { n: `<b>${esc(sx.n)}</b>` })}</p>` : "";
    if (next) parts.push(card(next, T("Próxima competición de su universidad") + (daysUntil(next.d) > 0 ? ` · ${daysUntil(next.d) === 1 ? T("mañana") : T("en {n} días", { n: daysUntil(next.d) })}` : ""), "next"));
    return `<h2>📍 ${T("¿Dónde compite su universidad?")}</h2>${note}${parts.join("")}`;
  }
  if (!parts.length) parts.push(`<div class="card muted">${T("Ahora mismo no está compitiendo.")}</div>`);
  if (last) parts.push(card(last, T("Última competición"), "last"));
  if (next) parts.push(card(next, T("Próxima competición") + (daysUntil(next.d) > 0 ? ` · ${daysUntil(next.d) === 1 ? T("mañana") : T("en {n} días", { n: daysUntil(next.d) })}` : ""), "next"));
  return `<h2>📍 ${T("¿Dónde compite?")}</h2>${parts.join("")}`;
}
const face = (x, size = 38) => x.img ? `<img class="face" src="${esc(x.img)}" alt="" width="${size}" height="${size}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">` : `<span class="avatar ${x.g === "W" ? "w" : "m"}">${x.g === "W" ? "♀" : "♂"}</span>`;
// Encuentros guardados de la universidad (esta temporada y anteriores), agrupados por temporada.
function storedSection(u) {
  const list = (resIdx?.meets || []).filter((m) => m.u.includes(u.n));
  if (!list.length) return "";
  const by = new Map();
  for (const m of list) { const k = m.s || (m.d || "").slice(0, 4); by.has(k) || by.set(k, []); by.get(k).push(m); }
  return `<h2>🗂️ ${T("Resultados completos guardados")} <span class="count">${list.length}</span></h2>${[...by].sort((a, b) => b[0].localeCompare(a[0])).map(([k, ms], i) => `<details class="season" ${i ? "" : "open"}><summary>${T("Temporada")} ${esc(k)} · ${ms.length}</summary><div class="list">${ms.map((m) => `<a class="urow mrow" href="#/m/${enc(m.id)}">${meetBadge({ name: m.n, org: /champ|conference|league/i.test(m.n) ? organization(m.n) : "dual", host: m.u.find((x) => x !== u.n) || m.u[0] }, 34)}<span class="uinfo"><b>${esc(m.n)}</b><small>${esc(fmtRange(m.d, m.e))} · ${m.ev} ${T("pruebas")}</small></span><span class="chev">›</span></a>`).join("")}</div></details>`).join("")}`;
}
function gameRow(team, g, both = false) {
  const today = todayUS();
  const when = g.d ? fmtDate(g.d) : g.dt || "";
  const won = /^W\b/i.test(g.r || ""), lost = /^L\b/i.test(g.r || "");
  const rid = resIdOf(g.res) || resIdOf(g.live);
  const inApp = !!(rid || g.live);
  const link = rid || g.live || g.res || g.recap;
  const href = rid ? `#/m/${enc(rid)}` : g.live ? `#/m/${enc(normalizeMeetUrl(g.live))}` : link;
  const inner = `${both ? crest(team, 30) : ""}<span class="vs">${g.at === "at" ? "@" : "vs"}</span>${crest(g.o, 30)}<span class="uinfo"><b>${both ? `${esc(team)} ${g.at === "at" ? "@" : "vs"} ` : ""}${esc(g.o)}</b><small>${esc([when, g.g === "M" ? "♂" : g.g === "W" ? "♀" : "", g.d && g.d >= today && !g.r ? T("próximamente") : ""].filter(Boolean).join(" · "))}</small></span>${g.r ? `<span class="res ${won ? "w" : lost ? "l" : ""}">${esc(g.r)}</span>` : ""}${link ? `<span class="chev">${inApp ? "›" : "↗"}</span>` : ""}`;
  return link ? `<a class="urow game" href="${esc(href)}" ${inApp ? "" : 'target="_blank" rel="noopener"'}>${inner}</a>` : `<div class="urow game">${inner}</div>`;
}
async function dualsSection() {
  const [d] = await Promise.all([loadData("calendario"), loadResIndex().catch(() => null)]);
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
  return `<details class="fold"><summary><h2>⚔️ ${T("Encuentros entre universidades")} <span class="count">${list.length}</span></h2></summary><div class="list">${list.slice(0, 200).map((x) => gameRow(x.team, x.g, true)).join("")}</div>${list.length > 200 ? `<p class="sub">${T("Y {n} más en la ficha de cada universidad.", { n: list.length - 200 })}</p>` : ""}</details>`;
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
    const row = (x) => `<a class="urow" href="#/n/${x.i}">${x.img ? face(x, 34) : crest(x.u ? x.u.n : x.t, 34)}<span class="uinfo"><b>${esc(x.n)} ${flagHtml(null, x)}</b><small>${esc([x.u ? x.u.n : x.t, x.g === "W" ? "♀" : x.g === "M" ? "♂" : "", x.y].filter(Boolean).join(" · "))}</small></span>${swStar(x)}</a>`;
    const fs = favSw();
    const mine = fs.size ? sw.filter((x) => fs.has(swKey(x))) : [];
    const favHtml = mine.length ? `<h2>★ ${T("Mis nadadores")} <span class="count">${mine.length}</span></h2><div class="list">${mine.map(row).join("")}</div>` : "";
    if (!words.length) {
      box.innerHTML = favHtml + `<div class="card muted">${T("Escribe un nombre (por ejemplo «Gemmell») o una universidad.")}${mine.length ? "" : " " + T("Marca con ☆ a tus nadadores y saldrán aquí.")}</div>`;
      return;
    }
    const hay = (x) => (x._h ||= `${x.n} ${x.t} ${x.u ? x.u.n + " " + x.u.full : ""}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
    const hits = sw.filter((x) => words.every((w) => hay(x).includes(w))).slice(0, 120);
    box.innerHTML = hits.length
      ? `<div class="list">${hits.map(row).join("")}</div>`
      : `<div class="card muted">${T("No hay nadadores con ese nombre en los resultados guardados.")}</div>`;
  };
  const input = document.getElementById("sq");
  input.oninput = (e) => render(e.target.value);
  render(q0);
}

// Biografías (web/data/bio/<universidad>.json): nadadores (p) y entrenadores (c).
const uniSlug = (n) => n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const loadBio = (uniName) => (uniName ? loadData("bio/" + uniSlug(uniName)).catch(() => null) : Promise.resolve(null));
const nameKey = (n) => (n || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\b[a-z]\b\.?/g, "").replace(/[^a-z]+/g, "");
function findBio(list, name) {
  if (!list) return null;
  if (list[name]) return list[name];
  const k = nameKey(name);
  const hit = Object.entries(list).find(([n]) => nameKey(n) === k);
  if (hit) return hit[1];
  // Mismo apellido y nombre que empieza igual ("Alex" / "Alexander").
  const tk = name.toLowerCase().split(/\s+/), last = tk[tk.length - 1];
  const f0 = (x) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const same = ([n]) => { const t = f0(n.toLowerCase()).split(/\s+/); const a = f0(tk[0]), b = t[0]; return a && b && (b.startsWith(a) || a.startsWith(b)) && (t[t.length - 1] === f0(last) || tk.slice(1).map(f0).includes(t[t.length - 1]) || t.slice(1).includes(f0(tk[1] || ""))); };
  return Object.entries(list).find(same)?.[1] || null;
}
const FACT_EN = { Ciudad: "Hometown", Instituto: "High school", "Universidad anterior": "Previous school", Carrera: "Major", Especialidad: "Position", Curso: "Class", Cargo: "Title", "Universidad donde estudió": "Alma mater", Experiencia: "Experience", Altura: "Height" };
// Bandera como imagen (los emojis de bandera no salen en todos los móviles/ordenadores).
const flagHtml = (bio, x) => { const f = flagOf((bio?.f || []).find(([l]) => l === "Ciudad")?.[1] || x?.ht); return f ? `<img class="flag" src="https://flagcdn.com/w40/${f.cc.toLowerCase()}.png" alt="${esc(f.name)}" title="${esc(f.name)}" width="20" height="15" loading="lazy" onerror="this.remove()">` : ""; };
function bioBlock(bio) {
  if (!bio || (!bio.b && !(bio.f || []).length)) return "";
  const facts = (bio.f || []).filter(([l]) => l !== "Cargo" && FACT_EN[l]).map(([l, v]) => `<div class="nrow"><span>${esc(lang() === "en" ? FACT_EN[l] || l : l)}</span><b>${l === "Ciudad" ? flagHtml(bio) + " " : ""}${esc(v)}</b></div>`).join("");
  const text = (bio.b || "").split(/\n+/).map((l) => (l.startsWith("## ") ? `<h4>${esc(l.slice(3))}</h4>` : `<p>${esc(l)}</p>`)).join("");
  return `<details class="bio"><summary>Bio</summary>${facts ? `<div class="card biofacts">${facts}</div>` : ""}${text ? `<div class="biotext">${text}</div>` : ""}${bio.u ? `<a class="biosrc" href="${esc(bio.u)}" target="_blank" rel="noopener">${T("Ficha en la web de la universidad")} ↗</a>` : ""}</details>`;
}
async function coachView(uniName, name) {
  setTab("uni");
  loading();
  await loadUnis().catch(() => {});
  const u = (unis || []).find((x) => x.n === uniName);
  const bios = await loadBio(uniName);
  const bio = findBio(bios?.c, name) || {};
  const st = (u?.staff || []).find((p) => nameKey(p.n) === nameKey(name)) || {};
  const title = st.t || (bio.f || []).find(([l]) => l === "Cargo")?.[1] || "";
  setTitle(name);
  const info = logoIndex ? matchTeam(logoIndex, uniName) : null;
  const tint = info && info.color && info.color !== "#0b63ce" ? info.color : "#0b3d91";
  $app.innerHTML = `<a class="back" href="#/uni/${enc(uniName)}">‹ ${esc(uniName)}</a>
  <section class="mhero uhero" style="--tint:${tint}">
    <div class="mtop">${bio.img ? `<span class="bigphoto"><img src="${esc(bio.img)}" alt="" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('nophoto')"><i>${crest(uniName, 30)}</i></span>` : `<span class="bigcrest">${crest(uniName, 76)}</span>`}<div><h1>${esc(name)} ${flagHtml(bio)}</h1><p><a href="#/uni/${enc(uniName)}">${esc(u?.full || uniName)}</a></p><p>${esc(title)}</p></div></div>
  </section>
  ${bioBlock(bio) || `<div class="card muted">${T("Su universidad no publica una biografía que se pueda leer.")}</div>`}
  ${st.e ? `<a class="btn wide alt" href="mailto:${esc(st.e)}">✉️ ${esc(st.e)}</a>` : ""}`;
  document.querySelector("details.bio")?.setAttribute("open", "");
}
// Orden de pruebas: estilo y distancia (50, 100, 200…).
const STROKE_ORDER = ["Free", "Back", "Breast", "Fly", "IM"];
function evOrder(ev) {
  const m = /(\d+)\s*([YM])?\s*(\w+)/.exec(ev) || [];
  const st = STROKE_ORDER.findIndex((x) => (ev || "").includes(x));
  return (m[2] === "M" ? 1e6 : 0) + (st < 0 ? 9 : st) * 1e4 + (+m[1] || 0);
}
// Mismo cálculo que scripts/split_nadadores.mjs.
const shardOf = (k) => { let h = 2166136261; for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) & 255).toString(16).padStart(2, "0"); };
async function loadSwimmerDetail(x, sw) {
  if (!x.src || x.detail) return;
  const secs = (t) => { const m = /^(?:(\d+):)?(\d+\.\d+)/.exec(t || ""); return m ? (+m[1] || 0) * 60 + +m[2] : Infinity; };
  for (const [n, t] of x.src) {
    const k = (n + "|" + t).toLowerCase().replace(/\s+/g, " ");
    const sh = await loadData("nad/" + shardOf(k)).catch(() => null);
    const e = sh?.s?.[k];
    Object.assign(sw.mi, sh?.mi || {});
    if (!e) continue;
    for (const [ev, v] of Object.entries(e[0] || {})) if (!x.b[ev] || secs(v[0]) < secs(x.b[ev][0])) x.b[ev] = v;
    for (const m of e[1] || []) if (!x.m.includes(m)) x.m.push(m);
  }
  x.detail = true;
}
async function swimmerView(i) {
  setTab("nad");
  loading();
  const [sw, arch] = await Promise.all([loadSwimmers().catch(() => []), loadArchiveRaw().catch(() => []), loadResIndex().catch(() => null)]);
  await loadUnis().catch(() => {});
  sw.mi ||= {};
  const x = sw[+i];
  if (!x) return errorView("Nadador no encontrado.");
  await loadSwimmerDetail(x, sw);
  setTitle(x.n);
  const uname = x.u ? x.u.n : x.t;
  const info = logoIndex ? matchTeam(logoIndex, uname) : null;
  const tint = info && info.color && info.color !== "#0b63ce" ? info.color : "#0b3d91";
  const yr = { FR: T("1º año"), SO: T("2º año"), JR: T("3º año"), SR: T("4º año"), GR: T("Posgrado"), "5Y": T("5º año") }[x.y] || "";
  const bio = x.u ? findBio((await loadBio(x.u.n))?.p, x.rf || x.n) : null;
  if (!x.img && bio?.img) x.img = bio.img;
  // Si su universidad compite ahora (o pronto), se muestra aquí: lo normal es que nade en esa competición.
  let nowHtml = "";
  if (x.u) try { const calD = await loadData("calendario"); nowHtml = nowSection(x.u, calD?.cal?.[x.u.n] || [], arch, { g: x.g === "M" || x.g === "W" ? x.g : "", n: x.n.split(" ")[0] }); } catch {}
  $app.innerHTML = `<a class="back" href="#/n">‹ ${T("Nadadores")}</a>
  <section class="mhero uhero" style="--tint:${tint}">
    <div class="mtop">${x.img ? `<span class="bigphoto"><img src="${esc(x.img)}" alt="" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('nophoto')"><i>${crest(uname, 30)}</i></span>` : `<span class="bigcrest">${crest(uname, 76)}</span>`}<div><h1>${esc(x.n)} ${flagHtml(bio, x)}</h1><p>${x.u ? `<a href="#/uni/${enc(x.u.n)}">${esc(x.u.full || x.u.n)}</a>` : esc(x.t)}</p><p>${esc([x.g === "W" ? T("Mujeres") : x.g === "M" ? T("Hombres") : "", yr].filter(Boolean).join(" · "))}</p></div>${swStar(x)}</div>
  </section>
  ${bioBlock(bio)}
  ${nowHtml}
  <h2>⏱️ ${T("Mejores marcas")}</h2>
  ${Object.keys(x.b).length ? `<div class="list">${Object.entries(x.b).sort((a, b) => evOrder(a[0]) - evOrder(b[0])).map(([ev, [t, m0, mid]]) => { const m = m0 || sw.mi[mid]?.[0] || ""; const id = mid || arch.find((s) => s.name.toLowerCase() === (m || "").toLowerCase())?.id; const dt = mid && sw.mi[mid] ? sw.mi[mid][1] : ""; return `<div class="srow"><span class="uinfo"><b>${esc(ev)}</b>${id ? `<a class="mlink" href="#/m/${enc(id)}">${esc(m)}${dt ? " · " + esc(fmtDate(dt)) : ""} ›</a>` : `<small>${esc(m)}</small>`}</span><span class="time" data-conv="${esc(t)}" data-ev="${esc(ev)}" role="button"><strong>${esc(t)}</strong></span></div>`; }).join("")}</div>` : `<div class="card muted">${T("Aún no tiene marcas en los resultados guardados.")}</div>`}
  ${x.m.length ? `<h2>📅 ${T("Últimas competiciones")}</h2><div class="list">${x.m.map((m) => { const st = sw.mi[m]; if (st) { const r = resIdx?.byId.get(m); return { id: m, name: st[0], start: st[1], end: r?.e || st[1], org: isDual(st[0]) || !/champ|conference|league|invit/i.test(st[0]) ? "dual" : organization(st[0]), host: r?.u?.[0] || "" }; } return arch.find((s) => s.name.toLowerCase() === m.toLowerCase()) || { name: m, org: organization(m) }; }).sort((a, b) => (b.start || "").localeCompare(a.start || "")).map((a) => { const m = a.name; const y = m.match(/\b(19|20)\d{2}\b/)?.[0] || (a.start || "").slice(0, 4); return `<div class="urow mrow">${meetBadge(a, 34)}<span class="uinfo">${a.id ? `<a href="#/m/${enc(a.id)}"><b>${esc(m)}</b></a>` : `<b>${esc(m)}</b>`}<small>${a.start ? esc(fmtRange(a.start, a.end)) : ""}</small></span><a class="minisc" href="${esc(SC_MEET(m.replace(/\b(19|20)\d{2}\b/g, "").trim(), y))}" target="_blank" rel="noopener">SwimCloud ↗</a></div>`; }).join("")}</div>` : ""}
  ${x.ro ? `<p class="sub center">✅ ${T("En la plantilla oficial de su universidad")}</p>` : ""}
  ${extButtons([[SC_SWIMMER(x.n, x.u ? x.u.n : x.t), "SwimCloud", "sc"], [USAS_SWIMMER(x.n), "USA Swimming", "usas"]])}
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
  if (parts[0] === "uni" && parts[1]) return uniView(parts[1], parts[2] || "");
  if (parts[0] === "rank" && parts[1] && parts[2]) return rankView(parts[1], parts[2], parts[3]);
  if (parts[0] === "coach" && parts[1] && parts[2]) return coachView(parts[1], parts[2]);
  if (parts[0] === "ajustes") return settingsView();
  if (parts[0] === "n" && parts[1]) return swimmerView(parts[1]);
  if (parts[0] === "n") return swimmersView();
  if (parts[0] === "u") return universitiesView();
  return homeView();
}

document.addEventListener("click", (e) => {
  const bs = e.target.closest("[data-favsw]");
  if (bs) {
    e.preventDefault();
    e.stopPropagation();
    const k = bs.dataset.favsw, f = favSw();
    f.has(k) ? f.delete(k) : f.add(k);
    store.set("favSw", [...f]);
    const on = f.has(k);
    document.querySelectorAll(`[data-favsw="${CSS.escape(k)}"]`).forEach((x) => { x.classList.toggle("on", on); x.textContent = on ? "★" : "☆"; });
    return;
  }
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


// Conversor de tiempos: yardas (25 yd), piscina corta (25 m) y piscina larga (50 m).
// Factores estándar: yardas↔metros ×1,11 (500/1000/1650 yd → 400/800/1500 m en piscina larga: ×0,8925 / ×0,8925 / ×1,02)
// y piscina corta↔larga sumando el tiempo de los virajes extra por cada 50 m (libre 0,8 s, espalda 0,6, braza 1,0, mariposa 0,7, estilos 0,8).
const secsOf = (t) => { const m = /(\d+):(\d{1,2}\.\d+)|(\d+\.\d+)/.exec(t || ""); return m ? (m[3] ? +m[3] : +m[1] * 60 + +m[2]) : NaN; };
const fmtSecs = (x) => { if (!isFinite(x) || x <= 0) return "—"; const m = Math.floor(x / 60), r = (x - m * 60).toFixed(2).padStart(5, "0"); return m ? `${m}:${r}` : (+r).toFixed(2); };
function eventSpec(title) {
  const t = String(title || "").toLowerCase();
  const dist = +(/(\d{2,4})\s*(?:yard|yd|y\b|meter|metre|m\b|lc|sc)/.exec(t)?.[1] || /\b(50|100|200|400|500|800|1000|1500|1650)\b/.exec(t)?.[1] || 0);
  const course = /yard|\byd\b|\by\b/.test(t) ? "Y" : /\blc\b|long course|lcm/.test(t) ? "L" : /meter|metre|\bm\b|scm|\bsc\b/.test(t) ? "S" : "";
  const stroke = /medley relay|\bim\b|individual medley/.test(t) ? "im" : /back/.test(t) ? "back" : /breast/.test(t) ? "breast" : /fly|butter/.test(t) ? "fly" : "free";
  return { dist, course, stroke };
}
const TURN = { free: 0.8, back: 0.6, breast: 1.0, fly: 0.7, im: 0.8 };
const Y2M = { 500: [400, 0.8925], 1000: [800, 0.8925], 1650: [1500, 1.02] };
const M2Y = { 400: [500, 0.8925], 800: [1000, 0.8925], 1500: [1650, 1.02] };
function convertTime(sec, dist, course, stroke) {
  // Todo pasa por piscina corta en metros (SCM).
  // Para 500/1000/1650 yd el factor va directo a piscina larga (400/800/1500 m).
  let scm, mdist;
  if (course === "Y") { const y = Y2M[dist]; mdist = y ? y[0] : dist; scm = y ? sec * y[1] - (mdist / 50) * TURN[stroke] : sec * 1.11; }
  else if (course === "L") { mdist = dist; scm = sec - (dist / 50) * TURN[stroke]; }
  else { mdist = dist; scm = sec; }
  const lcm = scm + (mdist / 50) * TURN[stroke];
  const yb = M2Y[mdist];
  const scy = yb ? lcm / yb[1] : scm / 1.11;
  return { Y: [yb ? yb[0] : mdist, scy], S: [mdist, scm], L: [mdist, lcm] };
}
function openConverter(time, title) {
  const ev = eventSpec(title);
  const sec = secsOf(time);
  document.querySelector(".convpop")?.remove();
  const sel = (name, val, opts) => `<select name="${name}">${opts.map(([v, l]) => `<option value="${v}"${v == val ? " selected" : ""}>${l}</option>`).join("")}</select>`;
  const box = document.createElement("div");
  box.className = "convpop";
  box.innerHTML = `<div class="convcard" role="dialog" aria-label="${T("Convertir tiempo")}">
    <button class="convx" aria-label="${T("Cerrar")}">×</button>
    <h3>⏱️ ${T("Convertir tiempo")}</h3>
    <div class="convform">
      <input name="t" inputmode="decimal" value="${esc(time.replace(/[^0-9:.]/g, ""))}">
      ${sel("d", ev.dist || 100, [[50, "50"], [100, "100"], [200, "200"], [400, "400"], [500, "500"], [800, "800"], [1000, "1000"], [1500, "1500"], [1650, "1650"]])}
      ${sel("s", ev.stroke, [["free", T("Libre")], ["back", T("Espalda")], ["breast", T("Braza")], ["fly", T("Mariposa")], ["im", T("Estilos")]])}
      ${sel("c", ev.course || "Y", [["Y", T("Yardas (25 yd)")], ["S", T("Piscina corta (25 m)")], ["L", T("Piscina larga (50 m)")]])}
    </div>
    <div class="convout"></div>
    <p class="sub">${T("Conversión aproximada con los factores habituales (yardas ×1,11 y virajes de 25 m). Úsala como orientación.")}</p>
  </div>`;
  document.body.appendChild(box);
  const f = (n) => box.querySelector(`[name=${n}]`);
  const draw = () => {
    const s0 = secsOf(f("t").value), d = +f("d").value, c = f("c").value, st = f("s").value;
    const r = convertTime(s0, d, c, st);
    const row = (k, label) => `<div class="convrow ${k === c ? "on" : ""}"><span>${label}</span><small>${r[k][0]} ${k === "Y" ? "yd" : "m"}</small><b>${fmtSecs(r[k][1])}</b></div>`;
    box.querySelector(".convout").innerHTML = row("Y", T("Yardas (25 yd)")) + row("S", T("Piscina corta (25 m)")) + row("L", T("Piscina larga (50 m)"));
  };
  box.addEventListener("input", draw);
  box.addEventListener("click", (e) => { if (e.target === box || e.target.closest(".convx")) box.remove(); });
  if (!isFinite(sec)) f("t").value = "";
  draw();
}
document.addEventListener("click", (e) => {
  const el = e.target.closest?.("[data-conv]");
  if (el) { e.preventDefault(); e.stopPropagation(); openConverter(el.dataset.conv, el.dataset.ev); return; }
  if (e.target.closest?.("a.rname")) e.stopPropagation();
}, true);
