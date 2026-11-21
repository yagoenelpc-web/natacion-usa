// Una vez al día, desde la web oficial de cada universidad (páginas públicas de calendario y plantilla):
// - web/data/calendario.json: competiciones de la temporada (duales incluidos), resultado y enlaces (PDF, crónica, directo).
// - web/data/plantillas.json: nombres de la plantilla oficial (para mostrar el equipo y corregir nombres cortados).
// - escudo oficial de la web si la universidad no tiene escudo (se guarda en unis.json).
// - enlaces a resultados en directo HY-TEK que aparezcan en el calendario → candidatos para archivo.json.
import { readFile, writeFile } from "node:fs/promises";

const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" };
const data = JSON.parse(await readFile("web/data/unis.json", "utf8"));
const unis = data.unis;
const PATHS = {
  "": ["/sports/swimming-and-diving", "/sports/swimming", "/sports/swim-and-dive", "/sports/swimming-diving", "/sports/sd", "/sports/swim", "/sports/swimdive"],
  M: ["/sports/mens-swimming-and-diving", "/sports/mens-swimming", "/sports/mens-swimming-diving", "/sports/mswim", "/sports/m-swim", "/sports/m-swimdive", "/sports/mswimdive"],
  W: ["/sports/womens-swimming-and-diving", "/sports/womens-swimming", "/sports/womens-swimming-diving", "/sports/wswim", "/sports/w-swim", "/sports/w-swimdive", "/sports/wswimdive"],
};
async function get(url) {
  try {
    const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    return { url: r.url, html: await r.text() };
  } catch {
    return null;
  }
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      try { await fn(items[k]); } catch {}
    }
  }));
}
const dec = (s) => s.replace(/&amp;/g, "&").replace(/&#39;|&rsquo;|&#8217;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
function jsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1]);
      const walk = (x) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === "object") { out.push(x); if (x.item) walk(x.item); if (x["@graph"]) walk(x["@graph"]); if (x.itemListElement) walk(x.itemListElement); } };
      walk(j);
    } catch {}
  }
  return out;
}
const seasonStart = (() => { const d = new Date(); const y = d.getUTCMonth() >= 7 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; return `${y}-08-01`; })();
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function dateOf(t) {
  const m = /^([A-Z][a-z]{2})[a-z]*\.? (\d{1,2})/.exec(t || "");
  if (!m || !MON[m[1].toLowerCase()]) return "";
  const mo = MON[m[1].toLowerCase()];
  const y0 = +seasonStart.slice(0, 4);
  const y = mo >= 8 ? y0 : y0 + 1;
  return `${y}-${String(mo).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}
const RESULTS_LINK = /\/(evtindex|index|\d*lastevt)\.htm$/i;

function schedule(html, base, uname) {
  const games = [];
  const live = new Set();
  // a) Bloques HTML clásicos de Sidearm (traen resultado y enlaces).
  const blocks = html.split(/<(?:li|div)[^>]+class="sidearm-schedule-game(?=[\s"])/i).slice(1);
  for (const b of blocks) {
    const opp = dec(/sidearm-schedule-game-opponent-name[^>]*>([\s\S]*?)<\/div>/i.exec(b)?.[1] || "");
    if (!opp) continue;
    const aria = /aria-label="[^"]*? on ([A-Z][a-z]+ \d{1,2}, \d{4})/i.exec(b)?.[1] || "";
    const dateTxt = dec(/sidearm-schedule-game-opponent-date[^>]*>([\s\S]*?)<\/div>/i.exec(b)?.[1] || "");
    const at = /sidearm-schedule-game-away[^>]*>\s*at\s*</i.test(b) ? "at" : /sidearm-schedule-game-home|vs\.?\s*</i.test(b) ? "vs" : "";
    const result = dec(/sidearm-schedule-game-result[^>]*>([\s\S]*?)<\/div>/i.exec(b)?.[1] || "").replace(/^Results?\s*/i, "");
    const links = {};
    for (const m of b.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const t = dec(m[2]);
      let href;
      try { href = new URL(m[1].replace(/&amp;/g, "&"), base).href; } catch { continue; }
      if (/\.pdf($|\?)/i.test(href) || /results/i.test(t)) links.res ||= href;
      if (/recap/i.test(t)) links.recap ||= href;
      if (RESULTS_LINK.test(new URL(href).pathname)) { links.live = href; live.add(href); }
      if (/live (stats|results)/i.test(t) && !links.live) links.live = href;
    }
    games.push({ d: aria ? new Date(aria + " UTC").toISOString().slice(0, 10) : dateOf(dateTxt), dt: dateTxt.slice(0, 40), o: opp, at, r: result.slice(0, 60), ...links });
  }
  // b) Datos estructurados (schema.org) si no hay bloques clásicos.
  if (!games.length) {
    for (const e of jsonLd(html).filter((x) => x["@type"] === "SportsEvent")) {
      const home = e.homeTeam?.name || "", away = e.awayTeam?.name || "";
      const self = /university|college/i.test(home) && home.toLowerCase().includes(uname.toLowerCase().split(" ")[0]);
      const at = / At /.test(e.name || "") ? "at" : "vs";
      const opp = at === "at" ? (self ? away : away || home) : away;
      games.push({ d: (e.startDate || "").slice(0, 10), o: opp || e.name || "", at, ...(e.url ? { recap: e.url } : {}) });
    }
  }
  for (const m of html.matchAll(/href="([^"]+)"/gi)) {
    try { const u = new URL(m[1].replace(/&amp;/g, "&"), base); if (RESULTS_LINK.test(u.pathname) && !/\/sports\//.test(u.pathname)) live.add(u.href); } catch {}
  }
  return { games: games.filter((g) => !g.d || g.d >= seasonStart), live: [...live] };
}
function roster(html, base) {
  const out = new Map();
  const hrefs = new Map();
  const abs = (u) => { try { return new URL(u.replace(/&amp;/g, "&"), base).href; } catch { return ""; } };
  // Webs nuevas de Sidearm: tarjetas de persona con "Nombre full bio" y su foto.
  for (const b of html.split(/data-test-id="s-person-details__root"/).slice(1)) {
    const m = /href="([^"]*)"[^>]*aria-label="([^"]+?) full bio"/.exec(b);
    if (!m || /\/(coaches|staff)\//i.test(m[1])) continue; // entrenadores fuera
    const n = m[2];
    const img = /<img[^>]+src="(https:\/\/images\.sidearmdev\.com\/[^"]+)"/.exec(b.slice(0, 6000))?.[1] || "";
    if (!out.has(dec(n))) { out.set(dec(n), img ? abs(img) : ""); hrefs.set(dec(n), abs(m[1])); }
  }
  // Webs de WMT (Learfield): enlaces /roster/player/ (tarjetas, listas o tabla). La foto real está en los datos de la página.
  if (!out.size) {
    const alts = [...html.matchAll(/<img[^>]*\balt="([^"]+)"[^>]*\btitle="([^"]+)"/g)].map((m) => [dec(m[1]).toLowerCase(), m[2]]);
    const photo = (name) => {
      const low = name.toLowerCase();
      // Presto y otras: <img alt="Nombre" src|data-src="foto real">
      const direct = [...html.matchAll(/<img[^>]*>/g)].map((m) => m[0]).find((tag) => (/\balt="([^"]*)"/.exec(tag)?.[1] || "").toLowerCase().startsWith(low) && /(?:data-src|src)="(?!data:)[^"]+\.(?:jpe?g|png|webp)/i.test(tag));
      if (direct) return abs(/(?:data-src|src)="((?!data:)[^"]+)"/.exec(direct.replace(/\bsrc="data:[^"]*"/, ""))[1]);
      const t = alts.find(([a]) => a.startsWith(low))?.[1];
      if (!t) return "";
      const i = html.indexOf(JSON.stringify(dec(t)) + ",");
      if (i < 0) return "";
      const after = html.slice(i, i + 1500);
      const urls = [...after.matchAll(/"(https:[^"]+)"/g)].map((m) => m[1].replace(/\\u002F/g, "/"));
      const small = urls.join(" ").match(/https:\S+rs:fit:(?:480|300|360|600):\S+/)?.[0];
      return small || urls[0] || "";
    };
    for (const m of html.matchAll(/<a [^>]*?href="([^"]*\/(?:roster\/player|bios)\/[^"]+)"[^>]*>([\s\S]{0,1500}?)<\/a>/g)) {
      const n = dec(m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
      if (!n || out.has(n) || !/^[\p{L}'’.\- ]{3,60}$/u.test(n)) continue;
      out.set(n, photo(n));
      hrefs.set(n, abs(m[1]));
    }
  }
  // Webs clásicas: datos estructurados (schema.org Person) con foto.
  if (!out.size) for (const p of jsonLd(html).filter((x) => x["@type"] === "Person" && x.name)) { out.set(dec(p.name), p.image?.url ? abs(p.image.url) : ""); if (p.url) hrefs.set(dec(p.name), abs(p.url)); }
  if (!out.size) for (const m of html.matchAll(/aria-label="([^"]+?) - View Profile"/g)) out.set(dec(m[1]), "");
  if (!out.size) for (const m of html.matchAll(/class="sidearm-roster-player-name"[\s\S]*?<a[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) { out.set(dec(m[2]), ""); hrefs.set(dec(m[2]), abs(m[1])); }
  // Fichas en webs clásicas aunque ya tengamos los nombres: enlaces /roster/<nombre>/<id>.
  for (const m of html.matchAll(/<a [^>]*?href="([^"]*\/roster\/(?!coaches)[a-z0-9-]+\/\d+[^"]*)"[^>]*>([\s\S]{0,400}?)<\/a>/gi)) {
    const n = dec(m[2]);
    if (out.has(n) && !hrefs.has(n)) hrefs.set(n, abs(m[1]));
  }
  const list = [...out].filter(([n]) => /^[\p{L}'’.\- ]{3,60}$/u.test(n) && n.includes(" ")).map(([n, img]) => (img ? [n, img] : [n]));
  list.hrefs = hrefs;
  return list;
}
// Entrenadores: enlaces a su ficha (/roster/coaches/… o /coaches/…) en la página de cuerpo técnico.
function coachLinks(html, base) {
  const out = new Map();
  for (const m of html.matchAll(/<a [^>]*?href="([^"]*\/(?:roster\/coaches|coaches)\/[a-z0-9-]+\/\d+[^"]*)"[^>]*>([\s\S]{0,600}?)<\/a>/gi)) {
    const n = dec(m[2]);
    if (!n || !/^[\p{L}'’.\- ]{3,60}$/u.test(n) || !n.includes(" ")) continue;
    try { out.has(n) || out.set(n, new URL(m[1].replace(/&amp;/g, "&"), base).href); } catch {}
  }
  return [...out];
}

// Escudo de la web oficial: Sidearm (/images/logos/site/), o el logo de la cabecera (svg/png con "logo" en el nombre o la clase).
function logoIn(html, base) {
  const abs = (x) => { try { return new URL(x.replace(/&amp;/g, "&"), base).href; } catch { return ""; } };
  const sa = /"image":\{"url":"(https?:\/\/[^"]+\/images\/logos\/site\/[^"]+)"/.exec(html)?.[1] || /(?:src|href)="([^"]*\/images\/logos\/site\/[^"]+\.(?:png|svg|jpg|webp)[^"]*)"/i.exec(html)?.[1];
  if (sa) return abs(sa);
  const img = /<img[^>]+(?:class|alt|id)="[^"]*logo[^"]*"[^>]*>/i.exec(html.slice(0, 200000))?.[0] || "";
  const src = /\b(?:data-src|src)="([^"]+\.(?:png|svg|webp)[^"]*)"/i.exec(img)?.[1];
  return src ? abs(src) : "";
}

const EXTRA = {
  "Grand Canyon": { M: [["Mario Perez Torrado", "https://images.sidearmdev.com/crop?url=https%3A%2F%2Fdxbhsrqyrr690.cloudfront.net%2Fsidearm.nextgen.sites%2Fgculopes.com%2Fimages%2F2025%2F10%2F1%2Fmario.png&width=200&height=200&type=webp"]] },
};
const cal = {}, plant = {}, liveLinks = new Set(), srcs = {}, bioLinks = {};
let logosAdded = 0, athFound = 0;
// Webs deportivas mal detectadas en algunas universidades.
const FIX = { "Carson–Newman": "https://cneagles.com", "Staten Island": "https://csidolphins.com", "Concordia (D2)": "https://cuigoldeneagles.com", "Florida Institute Technology": "https://floridatechsports.com", "Lees–McRae": "https://lmcbobcats.com", "Lynn": "https://lynnfightingknights.com", "Mars Hill": "https://mhulions.com", "Roberts Wesleyan": "https://robertsredhawks.com", "Saint Michael's": "https://smcathletics.com", "Southern Connecticut State": "https://southernctowls.com", "Albion": "https://albionbritons.com", "Allegheny": "https://alleghenygators.com", "Alma": "https://almascots.com", "Asbury": "https://asburyeagles.com", "Austin": "https://acroos.com", "Bridgewater State": "https://bsubears.com", "Brooklyn": "https://brooklyncollegeathletics.com", "California Institute Technology": "https://gocaltech.com", "Catholic University": "https://catholicathletics.com", "Cedar Crest": "https://cedarcrestfalcons.com", "Centre": "https://centrecolonels.com", "Chatham": "https://chathamathletics.com", "Clark": "https://clarkathletics.com", "Connecticut College": "https://camelathletics.com", "Drew": "https://drewrangers.com", "Elms": "https://elmsblazers.com", "Fairleigh Dickinson , Florham": "https://fdudevils.com", "Gallaudet": "https://gallaudetathletics.com", "Gettysburg": "https://gettysburgsports.com", "Greensboro": "https://gcpride.com", "Hamline": "https://hamlineathletics.com", "Hanover": "https://hanoverathletics.com", "Hartwick": "https://hartwickhawks.com", "Hendrix": "https://hendrixwarriors.com", "Illinois Tech": "https://illinoistechathletics.com", "Immaculata Mighty": "https://immaculataathletics.com", "Juniata": "https://juniataeagles.com", "Loras": "https://duhawkathletics.com", "Marymount": "https://marymountsaints.com", "Marywood": "https://marywoodpacers.com", "McDaniel": "https://mcdanielathletics.com", "Messiah": "https://gomessiah.com", "Nazareth": "https://nazathletics.com", "Olivet": "https://olivetcomets.com", "Penn State Behrend": "https://psbehrendsports.com", "Piedmont": "https://piedmontlions.com", "Randolph": "https://randolphwildcats.com", "St. Joseph's-Long Island": "https://sjcathletics.com", "St. Joseph's": "https://gomonks.com", "St. Olaf": "https://athletics.stolaf.edu", "Sarah Lawrence": "https://gogryphons.com", "Sewanee": "https://sewaneetigers.com", "Smith": "https://smithpioneers.com", "New Paltz": "https://newpaltzhawks.com", "Oneonta State": "https://oneontaathletics.com", "Potsdam State": "https://potsdambears.com", "Purchase College": "https://purchasecollegeathletics.com", "Stevenson": "https://gomustangsports.com", "Susquehanna River": "https://susquehannasports.com", "Swarthmore": "https://swarthmoreathletics.com", "ULV": "https://leopardathletics.com", "Minnesota Morris": "https://cougars.morris.umn.edu", "Ozarks": "https://ozarkseagles.com", "Puget Sound": "https://loggerathletics.com", "Utica": "https://uticapioneers.com", "Warren Wilson": "https://warrenwilsonowls.com", "Wellesley": "https://wellesleyblue.com", "Wells": "https://wellsexpress.com", "Westfield State": "https://westfieldstateowls.com", "Westminster": "https://westminstertitans.com", "Wheaton (IL)": "https://wheatonthunder.com", "Whittier": "https://poetathletics.com", "Whitworth": "https://whitworthpirates.com", "Arizona Christian": "https://acufirestorm.com", "Saint Mary (NE)": "https://csmflames.com", "Life": "https://liferunningeagles.com", "Master's": "https://mastersathletics.com", "Midland": "https://midlandathletics.com", "ONU": "https://olivetathletics.com", "Simpson (NAIA)": "https://simpsonathletics.org", "SUA": "https://sokalions.com", "Emmanuel": "https://emmanuelsaints.com", "Converse": "https://conversevalkyries.com", "Salem (VA)": "https://salemtigers.com", "Puerto Rico Mayagüez": "https://www.uprm.edu", "Bluefield State": "https://bluefieldstateathletics.com", "Carnegie Mellon": "https://athletics.cmu.edu", "Saint Vincent (NY)": "https://mscathletics.com", "Anderson Ravens": "https://athletics.anderson.edu", "Alfred State": "https://alfredstateathletics.com", "Buff State": "https://buffalostateathletics.com", "Mount Holyoke": "https://athletics.mtholyoke.edu", "State New York Delhi": "https://delhibroncos.com", "St. Ambrose Fighting Bees & Queen": "https://saintambroseathletics.com", "Columbia (SC)": "https://ccfightingkoalas.com", "SCAD": "https://scadbees.com", "WBU": "https://wbuathletics.com", Tennessee: "https://utsports.com", Omaha: "https://omavs.com", "Indiana State": "https://gosycamores.com", "Mount St. Mary's": "https://mountathletics.com", "Central Connecticut": "https://ccsubluedevils.com", Missouri: "https://mutigers.com", Arkansas: "https://arkansasrazorbacks.com", "Arizona State": "https://thesundevils.com", "Saint John's": "https://gojohnnies.com", "Saint Benedict": "https://gobennies.com", Manchester: "https://muspartans.com", "Minnesota State Moorhead": "https://msumdragons.com", Denison: "https://denisonbigred.com", "Knox Prairie": "https://prairiefire.knox.edu" };
for (const u of unis) if (FIX[u.n]) u.web = FIX[u.n];
const todo = unis.filter((u) => u.web);
await pool(todo, 10, async (u) => {
  let base = u.web.replace(/^(https?:\/\/[^/]+).*$/, "$1");
  const want = u.men && u.women ? ["", "M", "W"] : u.men ? ["", "M"] : ["", "W"];
  const games = [], names = { M: [], W: [], "": [] };
  let siteLogo = "";
  let foundCombined = false;
  for (let pass = 0; pass < 2; pass++) {
  foundCombined = false;
  for (const who of want) {
    if (who && foundCombined) break;
    for (const p of PATHS[who]) {
      const s = await get(base + p + "/schedule");
      let got = false;
      if (s && /schedule/i.test(s.url)) {
        const r = schedule(s.html, s.url, u.n);
        for (const g of r.games) if (!games.some((x) => x.d === g.d && x.o === g.o)) games.push(who ? { ...g, g: who } : g);
        r.live.forEach((l) => liveLinks.add(l));
        siteLogo ||= logoIn(s.html, s.url);
        got = r.games.length > 0;
        if (got) (srcs[u.n] ||= []).push(who + "|" + s.url);
      }
      const ro = await get(base + p + "/roster");
      if (ro && /roster/i.test(ro.url)) {
        const list = roster(ro.html, ro.url);
        // Más de 130 nombres no es una plantilla de natación (p. ej. lista histórica de deportistas).
        if (list.length && list.length <= 130) {
          names[who] = list; got = true;
          const bl = (bioLinks[u.n] ||= { p: {}, c: {} });
          for (const [n, h] of list.hrefs) bl.p[n] = h;
          const co = await get(ro.url.replace(/\/roster.*$/, "/coaches"));
          if (co) for (const [n, h] of coachLinks(co.html, co.url)) bl.c[n] = h;
        }
      }
      if (got) {
        if (!who && names[""].length) foundCombined = true;
        break;
      }
    }
  }
  // Si no encontramos nada con las rutas típicas, buscamos en la portada de su web los enlaces de natación.
  if (!names[""].length && !names.M.length && !names.W.length) {
    const home = await get(base + "/");
    const slugs = [...new Set([...(home?.html || "").matchAll(/href="(?:https?:\/\/[^"\/]+)?(\/sports\/[a-z0-9-]*(?:swim|dive|sd)[a-z0-9-]*)\/?(?:roster|schedule)?\/?"/gi)].map((m) => m[1].toLowerCase()))].slice(0, 4);
    for (const p of slugs) {
      const who = /women|wswim|w-swim|\/w-/.test(p) ? "W" : /\/m|men/.test(p) ? "M" : "";
      if (names[who].length) continue;
      const ro = await get(base + p + "/roster");
      if (ro) { const list = roster(ro.html, ro.url); if (list.length) names[who] = list; }
      if (!games.length) {
        const s2 = await get(base + p + "/schedule");
        if (s2) { const gs = schedule(s2.html, s2.url, u.n).games; for (const g of gs) games.push(who ? { ...g, g: who } : g); if (gs.length) (srcs[u.n] ||= []).push(who + "|" + s2.url); }
      }
    }
  }
  if (names[""].length || names.M.length || names.W.length || games.length || pass) break;
  // La web guardada es la de la universidad: buscamos su enlace "Athletics" y probamos allí.
  const uhome = await get(base + "/");
  const ath = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>\s*(?:<[^>]+>\s*)*(?:Athletics|Varsity Athletics|Intercollegiate Athletics)\s*</i.exec(uhome?.html || "")?.[1] || /href="(https?:\/\/(?:www\.)?(?:athletics\.[^"\/]+|[a-z0-9-]*(?:athletics|sports)\.(?:com|org|net))[^"]*)"/i.exec(uhome?.html || "")?.[1];
  if (!ath) break;
  const nb = ath.replace(/^(https?:\/\/[^/]+).*$/, "$1");
  if (nb === base) break;
  base = nb; u.uweb ||= u.web; u.web = nb; athFound++;
  }
  if (games.length) cal[u.n] = games.sort((a, b) => (a.d || "").localeCompare(b.d || "")).slice(0, 40);
  const staffSet = new Set((u.staff || []).map((x) => x.n.toLowerCase()));
  for (const k of Object.keys(names)) names[k] = names[k].filter(([n]) => !staffSet.has(n.toLowerCase()));
  // Nadadores que el usuario pidió añadir aunque ya no salgan en la plantilla de este año (temporada 2025-26).
  for (const [g, list] of Object.entries(EXTRA[u.n] || {})) for (const e of list) if (!names[g].some(([n]) => n.toLowerCase() === e[0].toLowerCase())) names[g].push(e);
  const all = [...names[""], ...names.M, ...names.W];
  if (all.length) plant[u.n] = { ...(names.M.length ? { M: names.M } : {}), ...(names.W.length ? { W: names.W } : {}), ...(names[""].length ? { X: names[""] } : {}) };
  // Escudo que falta (o que en Wikipedia es una foto): el de su web oficial.
  const photoLogo = /\.jpe?g(\?|$)/i.test(u.logo || "");
  if (!siteLogo && (!u.logo || photoLogo)) { const h = await get(base + "/"); if (h) siteLogo = logoIn(h.html, h.url); }
  if (siteLogo && (!u.logo || u._badLogo || photoLogo)) { u.logo = siteLogo; logosAdded++; }
});
console.log("calendarios:", Object.keys(cal).length, "plantillas:", Object.keys(plant).length, "nadadores en plantillas:", Object.values(plant).reduce((a, p) => a + (p.M?.length || 0) + (p.W?.length || 0) + (p.X?.length || 0), 0), "con foto:", Object.values(plant).flatMap((p) => [...(p.M || []), ...(p.W || []), ...(p.X || [])]).filter((x) => x[1]).length, "D-I con plantilla:", unis.filter((u) => u.div === "D1" && plant[u.n]).length, "de", unis.filter((u) => u.div === "D1").length, "escudos añadidos:", logosAdded, "enlaces directo:", liveLinks.size, "webs de deportes encontradas:", athFound);
console.log("ejemplo Drury:", JSON.stringify(cal.Drury || []).slice(0, 800));
console.log("enlaces:", [...liveLinks].slice(0, 30).join(" "));
await writeFile("web/data/calendario.json", JSON.stringify({ updated: new Date().toISOString().slice(0, 10), live: [...liveLinks], cal, src: srcs }));
await writeFile("web/data/enlaces-bio.json", JSON.stringify(bioLinks));
// Logos de las conferencias (ESPN): los mapas de Wikipedia no sirven como logo.
try {
  // Ids de ESPN comprobados viendo la imagen (ncaa_conf/500/<id>.png).
  const ids = { acc: 1, big12: 4, bigten: 5, sec: 8, pac12: 9, cusa: 12, mac: 15, mw: 17, sunbelt: 37, aac: 151 };
  const marcas = Object.fromEntries(Object.entries(ids).map(([k, g]) => [k, `https://a.espncdn.com/i/teamlogos/ncaa_conf/500/${g}.png`]));
  // El resto: el archivo cuyo nombre lleva "logo" en su artículo de Wikipedia (la imagen principal suele ser un mapa).
  const { BRAND_PAGES, CONF_WORDS } = await import("../web/logos.js");
  const confKeys = new Set(CONF_WORDS.map((x) => x[1]));
  for (const [k, page] of Object.entries(BRAND_PAGES)) {
    if (marcas[k] || /^https?:/.test(page) || !confKeys.has(k)) continue;
    try {
      const j = await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(page)}&prop=images&imlimit=100&format=json&redirects=1`, { headers: UA })).json();
      const imgs = Object.values(j.query?.pages || {}).flatMap((x) => x.images || []).map((x) => x.title.replace(/^File:/, ""));
      const best = imgs.filter((f) => /logo|wordmark/i.test(f) && !/map|commons-logo|wiki|edit|question|flag|seal|symbol|icon|portal/i.test(f)).sort((a, b) => (/\.svg$/i.test(b) ? 1 : 0) - (/\.svg$/i.test(a) ? 1 : 0))[0];
      if (best) marcas[k] = `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(best.replace(/ /g, "_"))}?width=200`;
    } catch {}
  }
  await writeFile("web/data/marcas.json", JSON.stringify({ updated: new Date().toISOString().slice(0, 10), conf: marcas }));
  console.log("logos de conferencias:", Object.keys(marcas).length, JSON.stringify(marcas));
} catch (e) { console.log("logos de conferencias:", e.message); }
await writeFile("web/data/plantillas.json", JSON.stringify({ updated: new Date().toISOString().slice(0, 10), plant }));
await writeFile("web/data/unis.json", JSON.stringify(data));
