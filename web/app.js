import { normalizeMeetUrl, parseIndex, parseEvent, parseCatalog, uniqueEvents, isLive, organization, todayUS } from "./parser.js";
import { buildIndex, matchTeam, initials, colorFor, BRAND_PAGES } from "./logos.js";

const SOURCE = "https://swimmeetresults.tech/";
const ESPN = [
  "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=1000",
  "https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/teams?limit=1000",
];
const ORG = {
  ncaa: { label: "NCAA", full: "NCAA" },
  usas: { label: "USA Swimming", full: "USA Swimming" },
  usms: { label: "US Masters", full: "US Masters Swimming" },
  conf: { label: "Conferencias", full: "Conferencias y otros" },
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
  const res = await fetch("/api/fuente?url=" + encodeURIComponent(url));
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
const meetUrlFromId = (id) => normalizeMeetUrl(SOURCE + id);
const eventKey = (url) => url.split("/").pop().replace(/\.html?$/i, "");

async function loadLogos() {
  if (logoIndex) return logoIndex;
  const cached = store.get("logos");
  if (cached && Date.now() - cached.t < 7 * 864e5) {
    logoIndex = cached.v;
  } else {
    const payloads = await Promise.all(ESPN.map((u) => api(u, 86400).then(JSON.parse).catch(() => null)));
    logoIndex = buildIndex(payloads.filter(Boolean));
    if (Object.keys(logoIndex).length) store.set("logos", { t: Date.now(), v: logoIndex });
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

async function loadEvent(url, live) {
  return parseEvent(await api(url, live ? 45 : 6 * 3600), url);
}

// ---------- utilidades de vista ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const enc = encodeURIComponent;
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
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
  return `${wd ? DAYS[wd] + " " : ""}${+m[2]} ${MONTHS[+m[1] - 1]}`;
}
function daysUntil(iso) {
  const ms = Date.parse(iso + "T12:00:00Z") - Date.parse(todayUS() + "T12:00:00Z");
  return Math.round(ms / 864e5);
}
function englishToSpanish(name) {
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
  const info = logoIndex ? matchTeam(logoIndex, team) : null;
  if (info) return `<img class="crest" src="${esc(info.logo)}" alt="" width="${size}" height="${size}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'crest badge',textContent:'${esc(initials(team))}'}))">`;
  return `<span class="crest badge" style="--c:${colorFor(team)};width:${size}px;height:${size}px">${esc(initials(team))}</span>`;
}
function orgLogo(org, size = 36) {
  const src = brands[org];
  if (src) return `<span class="org" style="width:${size}px;height:${size}px"><img src="${esc(src)}" alt="${esc(ORG[org].label)}"></span>`;
  return `<span class="org org-txt" style="width:${size}px;height:${size}px">${esc((ORG[org] || ORG.conf).label.slice(0, 4))}</span>`;
}
const star = (team) => `<button class="star ${favs().has(team) ? "on" : ""}" data-fav="${esc(team)}" aria-label="Favorita">${favs().has(team) ? "★" : "☆"}</button>`;
const liveDot = `<span class="livetag"><i></i>EN DIRECTO</span>`;

function setTitle(t) {
  document.title = t ? `${t} · Natación USA` : "Natación USA";
}
function loading(msg = "Cargando…") {
  $app.innerHTML = `<div class="loading"><div class="spinner"></div><p>${esc(msg)}</p></div>`;
}
function errorView(msg) {
  $app.innerHTML = `<div class="empty"><p>${esc(msg)}</p><button class="btn" onclick="location.reload()">Reintentar</button></div>`;
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
  let when = s.pending ? `Temporada ${s.id.match(/(19|20)\d{2}/)?.[0] || ""} · resultados aún no publicados` : fmtRange(s.start, s.end);
  if (s.status === "upcoming" && s.start) {
    const d = daysUntil(s.start);
    when += d === 1 ? " · mañana" : ` · en ${d} días`;
  }
  if (s.pending) return `<div class="mcard upcoming pending">${orgLogo(s.org)}<div class="mbody"><strong>${esc(s.name)}</strong><span class="sub">${esc(when)}</span></div></div>`;
  return `<a class="mcard ${s.status}" href="#/m/${enc(s.id)}">
    ${orgLogo(s.org)}
    <div class="mbody">
      ${s.status === "live" ? liveDot : ""}
      <strong>${esc(s.name)}</strong>
      <span class="sub">${esc(when)}${s.events ? ` · ${s.events} pruebas` : ""}</span>
    </div><span class="chev">›</span></a>`;
}

async function homeView() {
  setTab("home");
  setTitle("");
  loading("Buscando campeonatos…");
  await Promise.all([loadBrands().catch(() => {}), loadLogos().catch(() => {})]);
  let list;
  try {
    list = await loadSummaries();
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
    <h1>Natación USA</h1>
    <p>Resultados de NCAA, USA Swimming y campeonatos de EE. UU.</p>
  </section>
  <section>
    <h2>En directo</h2>
    ${live.length ? live.map(meetCard).join("") : `<div class="card muted">Ahora mismo no hay ningún campeonato en directo.${next ? ` El próximo es <a href="#/m/${enc(next.id)}">${esc(next.name)}</a>, ${daysUntil(next.start) === 1 ? "mañana" : `dentro de ${daysUntil(next.start)} días`}.` : ""}</div>`}
  </section>
  ${f.length ? `<section><h2>Mis universidades</h2><div class="chips">${f.map((t) => `<a class="chip" href="#/u/${enc(t)}">${crest(t, 22)}${esc(t)}</a>`).join("")}</div></section>` : ""}
  ${upcoming.length ? `<section><h2>Próximamente</h2>${upcoming.map(meetCard).join("")}</section>` : ""}
  ${Object.keys(ORG).filter((o) => byOrg[o]).map((o) => `<section><h2 class="orgh">${orgLogo(o, 26)} ${esc(ORG[o].full)}</h2>${byOrg[o].map(meetCard).join("")}</section>`).join("")}
  <p class="foot">Datos de las páginas públicas de resultados HY-TEK. Los tiempos son oficiosos hasta su publicación oficial.</p>`;
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
  let standings = null;
  if (meet.lastEventUrl && tab !== "pruebas") {
    try {
      const last = await loadEvent(meet.lastEventUrl, live);
      standings = last.scores.length ? last : null;
    } catch {}
  }
  if (!standings && tab !== "pruebas") {
    const evs = uniqueEvents(meet).sort((a, b) => b.number - a.number);
    for (const e of evs.slice(0, 6)) {
      try {
        const ev = await loadEvent(e.url, live);
        if (ev.scores.length) {
          standings = ev;
          break;
        }
      } catch {}
    }
  }

  const tabs = [["pruebas", "Pruebas"], ["clasificacion", "Clasificación"], ["equipos", "Universidades"]];
  let body = "";
  if (tab === "pruebas") {
    body = meet.sessions
      .map(
        (s) => `<div class="session"><h3>${esc(s.title.replace("Session", "Sesión"))}<span>${esc(fmtDay(s.day))}</span></h3>
        ${s.events.map((e) => `<a class="erow" href="#/m/${enc(id)}/e/${enc(eventKey(e.url))}"><span class="num">${e.number}</span><span class="ename">${esc(englishToSpanish(e.name))}</span>${e.relay ? `<span class="tag">Relevo</span>` : ""}<span class="chev">›</span></a>`).join("")}
      </div>`
      )
      .join("") || `<div class="card muted">Todavía no hay pruebas publicadas.</div>`;
  } else if (tab === "clasificacion") {
    body = standings
      ? `<p class="sub pad">Tras la prueba ${standings.number}</p><div class="list">${standings.scores
          .map((s, i) => `<a class="srow" href="#/m/${enc(id)}/t/${enc(s.t)}"><span class="place p${s.p}">${s.p}</span>${crest(s.t)}<span class="sname">${esc(s.t)}</span><span class="pts">${esc(s.pts)}<small> pts</small></span></a>`)
          .join("")}</div>`
      : `<div class="card muted">La clasificación aparecerá cuando haya pruebas puntuables terminadas.</div>`;
  } else {
    const teams = standings ? standings.scores.map((s) => s.t) : [];
    body = teams.length
      ? `<div class="grid">${teams.map((t) => `<a class="tcard" href="#/m/${enc(id)}/t/${enc(t)}">${crest(t, 48)}<span>${esc(t)}</span></a>`).join("")}</div>`
      : `<div class="card muted">La lista de universidades aparecerá cuando haya resultados.</div>`;
  }

  $app.innerHTML = `
  <a class="back" href="#/">‹ Inicio</a>
  <section class="mhead">
    ${orgLogo(meet.org, 52)}
    <div><h1>${esc(meet.name)}</h1><p class="sub">${esc(fmtRange(meet.start, meet.end))} ${live ? liveDot : ""}</p></div>
  </section>
  ${live && meet.lastEventUrl ? `<a class="lastev" href="#/m/${enc(id)}/e/${enc(eventKey(meet.lastEventUrl))}">⚡ Última prueba terminada</a>` : ""}
  <nav class="seg">${tabs.map(([k, l]) => `<a class="${k === tab ? "on" : ""}" href="#/m/${enc(id)}${k === "pruebas" ? "" : "/" + k}">${l}</a>`).join("")}</nav>
  ${body}`;
  if (live) scheduleRefresh((s) => meetView(id, tab, s));
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
  </summary>${extra.join("") || `<div class="splits muted">Sin parciales</div>`}
  <a class="tlink" href="#/m/${enc(id)}/t/${enc(r.t)}">Ver todo de ${esc(r.t)} ›</a></details>`;
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
    $app.innerHTML = `<a class="back" href="#/m/${enc(id)}">‹ Volver</a><div class="card muted">Esta prueba todavía no tiene resultados. Se comprobará de nuevo cada minuto.</div>`;
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
        h = `<div class="sec">${esc(SECTION_ES[r.s] || r.s)}</div>`;
      }
      return h + resultRow(r, ev.relay, id, isFav(r.t, f));
    })
    .join("");
  $app.innerHTML = `
  <a class="back" href="#/m/${enc(id)}">‹ ${esc(meet.name)}</a>
  <section class="ehead"><span class="num big">${ev.number ?? ""}</span><div><h1>${esc(englishToSpanish(ev.title))}</h1><p class="sub">${meet.status === "live" ? liveDot : esc(fmtRange(meet.start, meet.end))}</p></div></section>
  ${f.size ? `<label class="toggle"><input type="checkbox" id="onlyFav" ${onlyFav ? "checked" : ""}> Solo mis universidades</label>` : ""}
  ${ev.records.length ? `<details class="records"><summary>Récords</summary>${ev.records.map((r) => `<div>${esc(r)}</div>`).join("")}</details>` : ""}
  <div class="list">${rows || `<div class="card muted">Sin resultados todavía.</div>`}</div>
  ${ev.scores.length ? `<h2>Clasificación por equipos</h2><div class="list">${ev.scores.slice(0, 10).map((s) => `<a class="srow" href="#/m/${enc(id)}/t/${enc(s.t)}"><span class="place p${s.p}">${s.p}</span>${crest(s.t)}<span class="sname">${esc(s.t)}</span><span class="pts">${esc(s.pts)}<small> pts</small></span></a>`).join("")}</div><a class="more" href="#/m/${enc(id)}/clasificacion">Ver clasificación completa ›</a>` : ""}`;
  const cb = document.getElementById("onlyFav");
  if (cb) cb.onchange = () => (store.set("onlyFav", cb.checked), eventView(id, key, true));
  if (meet.status === "live") scheduleRefresh((s) => eventView(id, key, s));
}

async function teamView(id, team, silent = false) {
  setTab("home");
  if (!silent) loading(`Buscando resultados de ${team}…`);
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
  <section class="thead">${crest(team, 72)}<div><h1>${esc(team)}</h1><p class="sub">${standing ? `${standing.p}.º · ${esc(standing.pts)} puntos · ` : ""}${medals} podios</p></div>${star(team)}</section>
  <div class="list">${rows.map(({ ev, r }) => `<a class="trow" href="#/m/${enc(id)}/e/${enc(eventKey(ev.url))}"><span class="place p${r.p}">${esc(r.p)}</span><span class="who"><strong>${esc(ev.relay ? "Relevo " + (r.l || "") : r.n)}</strong><small>${esc(englishToSpanish(ev.title))}${r.s ? " · " + esc(SECTION_ES[r.s] || r.s) : ""}</small></span><span class="time"><strong>${esc(r.m)}</strong>${r.pts ? `<em>${esc(r.pts)} pts</em>` : ""}</span></a>`).join("") || `<div class="card muted">Sin resultados todavía.</div>`}</div>`;
  if (live) scheduleRefresh((s) => teamView(id, team, s));
}

async function universitiesView(q = "") {
  setTab("unis");
  setTitle("Universidades");
  loading();
  await loadLogos().catch(() => {});
  const f = favs();
  const seen = new Map();
  if (logoIndex) for (const info of Object.values(logoIndex)) if (info.display && !seen.has(info.display)) seen.set(info.display, info);
  const all = [...seen.keys()].sort((a, b) => a.localeCompare(b));
  const render = (query) => {
    const ql = query.trim().toLowerCase();
    const list = all.filter((t) => !ql || t.toLowerCase().includes(ql));
    document.getElementById("ulist").innerHTML =
      (f.size && !ql ? `<h2>Mis universidades</h2><div class="grid">${[...f].map((t) => `<div class="tcard">${crest(t, 48)}<span>${esc(t)}</span>${star(t)}</div>`).join("")}</div><h2>Todas</h2>` : "") +
      `<div class="list">${list.slice(0, 400).map((t) => `<div class="urow">${crest(t, 30)}<span>${esc(t)}</span>${star(t)}</div>`).join("")}</div>`;
  };
  $app.innerHTML = `<section class="pad"><h1>Universidades</h1><p class="sub">Marca con ★ las tuyas: aparecerán en la portada y podrás filtrar los resultados.</p>
    <input type="search" id="uq" placeholder="Buscar universidad" value="${esc(q)}"></section><div id="ulist"></div>`;
  render(q);
  document.getElementById("uq").oninput = (e) => render(e.target.value);
}

async function favTeamView(team) {
  // Busca la universidad en los campeonatos en directo o más recientes.
  setTab("unis");
  loading(`Buscando ${team}…`);
  const list = await loadSummaries().catch(() => []);
  const target = list.find((s) => s.status === "live") || list.filter((s) => s.status === "done").sort((a, b) => (b.start || "").localeCompare(a.start || ""))[0];
  if (target) location.replace(`#/m/${enc(target.id)}/t/${enc(team)}`);
  else errorView("No hay campeonatos con resultados ahora mismo.");
}

// ---------- enrutado ----------
function route() {
  clearInterval(refreshTimer);
  const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  window.scrollTo(0, 0);
  if (parts[0] === "m" && parts[1]) {
    if (parts[2] === "e" && parts[3]) return eventView(parts[1], parts[3]);
    if (parts[2] === "t" && parts[3]) return teamView(parts[1], parts[3]);
    return meetView(parts[1], parts[2] || "pruebas");
  }
  if (parts[0] === "u" && parts[1]) return favTeamView(parts[1]);
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
window.addEventListener("hashchange", route);
route();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
