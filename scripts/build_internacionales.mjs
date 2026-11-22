// Nadadores con ficha en Wikipedia de cada universidad (olímpicos, internacionales y profesionales que entrenan o
// entrenaron allí, como Léon Marchand o Carles Coll): categorías "<Equipo> men's/women's swimmers" de Wikipedia.
// De Wikidata: nacionalidad (código de país) y foto libre. Solo se guardan datos: nombre, página, foto, país, sexo.
// -> web/data/internacionales.json { u: { universidad: [[nombre, páginaWiki, foto, país, sexo, actual]] } }
// SOLO="Texas,Virginia Tech" prueba con esas universidades y lo imprime sin guardar.
import { readFile, writeFile } from "node:fs/promises";

const UA = { "User-Agent": "USAResultsApp/1.0 (swimming results app)" };
const SOLO = (process.env.SOLO || "").split(",").map((s) => s.trim()).filter(Boolean);
const J = async (f, d) => { try { return JSON.parse(await readFile("web/data/" + f, "utf8")); } catch { return d; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(host, params) {
  const u = `https://${host}/w/api.php?` + new URLSearchParams({ format: "json", formatversion: "2", ...params });
  await sleep(150);
  for (let i = 0; i < 6; i++) {
    try {
      const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (r.ok) { const j = await r.json(); if (!j.error) return j; }
      else if (r.status !== 429 && r.status < 500) return null;
    } catch {}
    await sleep(2000 * 2 ** i);
  }
  console.log("sin respuesta:", host, params.action, params.list || params.prop || "");
  return null;
}
const wp = (p) => api("en.wikipedia.org", p);
const wd = (p) => api("www.wikidata.org", p);

const unis = (await J("unis.json", { unis: [] })).unis.filter((u) => !SOLO.length || SOLO.includes(u.n));
async function members(cat) {
  const out = [];
  let cont = {};
  do {
    const r = await wp({ action: "query", list: "categorymembers", cmtitle: cat, cmnamespace: "0", cmlimit: "500", ...cont });
    if (!r) break;
    out.push(...(r.query?.categorymembers || []).map((m) => m.title));
    cont = r.continue || null;
  } while (cont);
  return out;
}
// Nombre del equipo en Wikipedia: el de su artículo de deportes ("Texas_Longhorns" → "Texas Longhorns").
const teamName = (u) => { try { return decodeURIComponent((u.wiki || "").split("/wiki/")[1] || "").replace(/_/g, " ").replace(/#.*$/, ""); } catch { return ""; } };
const out = {};
const pages = new Map(); // título → {g, unis:Set}
let nCats = 0;
const catsOf = (b) => [[`Category:${b} men's swimmers`, "M"], [`Category:${b} women's swimmers`, "W"], [`Category:${b} swimmers`, ""]];
const namesOf = (u) => [...new Set([teamName(u), `${u.n} ${u.nick || ""}`.trim()].filter((x) => x && x.split(" ").length >= 2))];
// Primero se pregunta de 50 en 50 qué categorías existen y tienen páginas, para no pedir miles de categorías vacías.
const allCats = [...new Set(unis.flatMap((u) => namesOf(u).flatMap((b) => catsOf(b).map(([c]) => c))))];
const exists = new Set();
for (let i = 0; i < allCats.length; i += 50) {
  const r = await wp({ action: "query", prop: "categoryinfo", titles: allCats.slice(i, i + 50).join("|") });
  const al = new Map((r?.query?.normalized || []).map((x) => [x.to, x.from]));
  for (const p of r?.query?.pages || []) if (p.categoryinfo?.pages > 0) exists.add(al.get(p.title) || p.title);
}
console.log("categorías posibles:", allCats.length, "· con nadadores:", exists.size);
for (const u of unis) {
  const names = namesOf(u);
  let found = false;
  for (const b of names) {
    for (const [cat, g] of catsOf(b)) {
      if (!exists.has(cat)) continue;
      const l = await members(cat);
      if (!l.length) continue;
      found = true; nCats++;
      for (const t of l) { if (!pages.has(t)) pages.set(t, { g, unis: new Set() }); const p = pages.get(t); p.unis.add(u.n); if (g && !p.g) p.g = g; }
    }
    if (found) break;
  }
  if (SOLO.length) console.log(u.n, "·", names.join(" | "), "→", found ? "con categoría" : "sin categoría");
}
// Nadadores que entrenan AHORA con el equipo de la universidad (grupos "pro" y selección). Fuentes de nov. 2026: lista
// oficial de la selección de EE. UU. 2026-27 (columna "Training Location") y noticias. Se quita a quien ya no está
// (Dressel se fue a Sporting Jax, Casas dejó Texas). Quien está en la plantilla de esta temporada no sale aquí: es
// nadador universitario normal y ya tiene su ficha. [universidad, página de Wikipedia, fuente, (Qid), (enlace)]
const USAS = "https://www.usaswimming.org/docs/default-source/national-teamdocuments/rosters/2026-2027-national-team-media-roster.pdf";
const PRO = [
  ["Texas", "Jillian Cox", USAS],
  ["Texas", "Piper Enge", USAS],
  ["Texas", "Erin Gemmell", USAS],
  ["Texas", "Kate Hurst", USAS],
  ["Texas", "Simone Manuel", USAS],
  ["Texas", "Regan Smith (swimmer)", USAS],
  ["Texas", "Jack Aikins", USAS],
  ["Texas", "Rowan Cox", USAS],
  ["Texas", "Carson Foster", USAS],
  ["Texas", "Nate Germonprez", USAS],
  ["Texas", "Chris Guiliano", USAS],
  ["Texas", "Aiden Hammer", USAS],
  ["Texas", "Luke Hobson", USAS],
  ["Texas", "Rex Maurer", USAS],
  ["Texas", "Campbell McKean", USAS],
  ["Texas", "Will Modglin", USAS],
  ["Texas", "Tyler Ray (swimmer)", USAS],
  ["Texas", "Jack Wilkening", USAS],
  ["Virginia", "Phoebe Bacon", USAS],
  ["Virginia", "Claire Curzan", USAS],
  ["Virginia", "Kate Douglass", USAS],
  ["Virginia", "Katie Grimes", USAS],
  ["Virginia", "Leah Hayes", USAS],
  ["Virginia", "Tess Howley", USAS],
  ["Virginia", "Madi Mintenko", USAS],
  ["Virginia", "Anna Moesch", USAS],
  ["Virginia", "Isabelle Stadden", USAS],
  ["Virginia", "Sophia Umstead", USAS],
  ["Virginia", "Gretchen Walsh", USAS],
  ["Virginia", "Alex Walsh", USAS],
  ["Virginia", "Emma Weber (swimmer)", USAS],
  ["Virginia", "Thomas Heilman", USAS],
  ["Virginia", "David King (swimmer)", USAS],
  ["Virginia", "Maximus Williamson", USAS],
  ["Florida", "Katie Ledecky", USAS],
  ["Florida", "Emma Weyant", USAS],
  ["Florida", "Bobby Finke", USAS],
  ["Stanford", "Torri Huske", USAS],
  ["Stanford", "Addie Robillard", USAS],
  ["Stanford", "Lucy Thomas (swimmer)", USAS],
  ["Stanford", "Henry McFadden", USAS],
  ["California", "Rylee Erisman", USAS],
  ["California", "Jack Alexy", USAS],
  ["California", "Brooks Curry", USAS],
  ["California", "Ryan Erisman", USAS],
  ["California", "Gabriel Jett", USAS],
  ["California", "Keaton Jones", USAS],
  ["California", "Ryan Murphy (swimmer)", USAS],
  ["Indiana", "Liberty Clark", USAS],
  ["Indiana", "Anna Peplowski", USAS],
  ["Indiana", "Alexei Avakov", USAS],
  ["Indiana", "Josh Bey", USAS],
  ["Indiana", "Finn Brooks", USAS],
  ["Indiana", "Noah Cakir", USAS],
  ["Indiana", "Van Mathias", USAS],
  ["Indiana", "Owen McDonald (swimmer)", USAS],
  ["Indiana", "Aaron Shackell", USAS],
  ["NC State", "Katharine Berkoff", USAS],
  ["NC State", "Leah Shackley", USAS],
  ["NC State", "Daniel Diehl", USAS],
  ["NC State", "Quintin McCarty", USAS],
  ["Michigan", "Hannah Bellard", USAS],
  ["Michigan", "Brady Kendall", USAS],
  ["Michigan", "Bella Sims", USAS],
  ["Michigan", "Josh Brown (swimmer)", USAS],
  ["Arizona State", "Adam Chaney", USAS],
  ["Arizona State", "Dylan Gravley", USAS],
  ["Arizona State", "Ilya Kharun", USAS],
  ["Arizona State", "Patrick Sammon", USAS],
  ["Georgia", "Kennedi Dobson", USAS],
  ["Georgia", "Sean Green (swimmer)", USAS],
  ["Ohio State", "Mariah Denigan", USAS],
  ["Ohio State", "Mila Nikanorov", USAS],
  ["Tennessee", "McKenzie Siroky", USAS],
  ["Tennessee", "Gabe Nunziata", USAS],
  ["North Carolina", "Skyler Smith", USAS],
  ["North Carolina", "David Melnychuk", USAS],
  ["Wisconsin", "Maggie Wanezek", USAS],
  ["Wisconsin", "Enzo Solitario", USAS],
  ["Louisville", "Finnley Conklin", USAS],
  ["Florida State", "Maddy Huggins", USAS],
  ["Harvard", "William Mulgrew", USAS],
  ["Penn", "Watson Nguyen", USAS],
  ["Minnesota", "Joey Tepper", USAS],
  // Internacionales (no salen en la lista de EE. UU.), con su fuente.
  ["Texas", "Léon Marchand", "https://swimswam.com/american-record-holder-shaine-casas-will-no-longer-be-training-at-texas"],
  ["Texas", "Hubert Kos", "https://swimswam.com/american-record-holder-shaine-casas-will-no-longer-be-training-at-texas"],
  ["Texas", "Summer McIntosh", "https://swimswam.com/american-record-holder-shaine-casas-will-no-longer-be-training-at-texas"],
  ["Texas", "Mitchell Schott", "https://swimswam.com/how-did-the-new-bob-bowman-swimmers-perform-at-their-end-of-season-meets"],
  ["Louisville", "Josh Matheny", "https://swimswam.com/caeleb-dressel-were-exactly-where-we-should-be-for-me-there-needs-to-be-more-intensity/"],
  ["Virginia", "Aimee Canny", "https://swimswam.com/ledecky-finke-regan-smith-marchand-kos-and-crooks-all-registered-to-race-at-virginia-scm-meet-in-october"],
  // Sin artículo en la Wikipedia inglesa: se usa su ficha de Wikidata y la Wikipedia en español.
  ["Virginia Tech", "Carles Coll", "https://www.marca.com/natacion/2026/11/11/ilusionante-curso-natacion-espanola-comienza-madrid.html", "Q126952996", "https://es.wikipedia.org/wiki/Carles_Coll"],
  ["Virginia Tech", "Carmen Weiler", "https://www.marca.com/natacion/2026/11/11/ilusionante-curso-natacion-espanola-comienza-madrid.html"],
].filter(([u]) => !SOLO.length || SOLO.includes(u));
// Plantillas de esta temporada: quien está en ellas es universitario, no profesional.
const plant = (await J("plantillas.json", { plant: {} })).plant || {};
const nk = (t) => t.replace(/\s*\(.*\)$/, "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
const onRoster = (u, t) => Object.values(plant[u] || {}).some((l) => l.some((e) => Array.isArray(e) && nk(String(e[0])) === nk(t)));
const proOf = new Map(), extra = new Map();
let nOut = 0;
for (const [u, t, , q, link] of PRO) {
  if (onRoster(u, t)) { nOut++; continue; }
  if (q) extra.set(t, { q, link });
  if (!pages.has(t)) pages.set(t, { g: "", unis: new Set() });
  pages.get(t).unis.add(u);
  proOf.set(t + "|" + u, 1);
}
console.log("categorías:", nCats, "· nadadores con página:", pages.size, "· profesionales:", proOf.size, "· en plantilla (no son pro):", nOut);
// Foto libre, id de Wikidata y descripción corta, de 50 en 50.
const titles = [...pages.keys()];
const info = new Map();
for (let i = 0; i < titles.length; i += 20) {
  const batch = titles.slice(i, i + 20);
  let cont = {};
  const alias = new Map();
  do {
    const r = await wp({ action: "query", prop: "pageprops|pageimages|description", ppprop: "wikibase_item", piprop: "thumbnail", pithumbsize: "240", pilicense: "free", pilimit: "50", titles: batch.join("|"), redirects: "1", ...cont });
    if (!r) break;
    for (const x of [...(r.query?.normalized || []), ...(r.query?.redirects || [])]) alias.set(x.to, alias.get(x.from) || x.from);
    for (const p of r.query?.pages || []) {
      if (p.missing) continue;
      const t = alias.get(p.title) || p.title;
      const o = info.get(t) || {};
      info.set(t, { q: p.pageprops?.wikibase_item || o.q, img: p.thumbnail?.source || o.img || "", desc: p.description || o.desc || "" });
    }
    cont = r.continue || null;
  } while (cont);
  await sleep(100);
}
for (const [t, e] of extra) if (!info.get(t)?.q) info.set(t, { q: e.q, img: "", desc: "", link: e.link });
console.log("páginas con datos:", info.size, "de", titles.length);
// Nacionalidad (P1532 país para el deporte, si no P27 ciudadanía) → código ISO del país (P297).
const qs = [...new Set([...info.values()].map((x) => x.q).filter(Boolean))];
const country = new Map(), personC = new Map(), personSex = new Map(), personImg = new Map();
for (let i = 0; i < qs.length; i += 50) {
  const r = await wd({ action: "wbgetentities", ids: qs.slice(i, i + 50).join("|"), props: "claims" });
  for (const [q, e] of Object.entries(r?.entities || {})) {
    const c = e.claims?.P1532?.[0]?.mainsnak?.datavalue?.value?.id || e.claims?.P27?.[0]?.mainsnak?.datavalue?.value?.id;
    if (c) personC.set(q, c);
    const im = e.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (im) personImg.set(q, `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(im.replace(/ /g, "_"))}?width=240`);
    const sx = e.claims?.P21?.[0]?.mainsnak?.datavalue?.value?.id;
    if (sx) personSex.set(q, sx === "Q6581097" ? "M" : sx === "Q6581072" ? "W" : "");
  }
}
console.log("Wikidata: personas", qs.length, "· con país", personC.size, "· con sexo", personSex.size);
const cs = [...new Set(personC.values())];
for (let i = 0; i < cs.length; i += 50) {
  const r = await wd({ action: "wbgetentities", ids: cs.slice(i, i + 50).join("|"), props: "claims" });
  for (const [q, e] of Object.entries(r?.entities || {})) { const iso = e.claims?.P297?.[0]?.mainsnak?.datavalue?.value; if (iso) country.set(q, iso.toLowerCase()); }
}
// Foto: primero la de su ficha de Wikidata (suele ser un retrato); la del artículo solo si no es de grupo (podio,
// relevo, varias personas) y el archivo lleva su apellido, para no poner la cara de otro.
const GROUP = /medal|podium|podio|ceremon|medaill|siegerehrung|relay|staffel|team|group|teammates|medalist|メダリスト|[_ ]and[_ ]|&|_y_|_et_|_und_|_en_/i;
const EVENT = /final|heat|meet|champ|race|wk[_ ]|[_ ]vs[_ ]|games|olymp|\d+ ?m[_ ]|yard/i;
const okPhoto = (url, name) => {
  if (!url) return false;
  const norm = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  let file = url.split("?")[0].split("/").pop() || "";
  try { file = decodeURIComponent(file); } catch {}
  // Varias personas: "Antani_Ivanov,_Kristóf_Milák,_Damian_Chrzanowski" (tras la coma, otro nombre sin cifras).
  const parts = file.replace(/\.[a-z]+$/i, "").replace(/_/g, " ").split(",").slice(1).map((t) => t.trim());
  if (GROUP.test(file) || parts.some((t) => /^\p{Lu}[\p{L}'-]+( \p{Lu}[\p{L}'-]+){1,2}$/u.test(t))) return false;
  // Foto de una carrera o un podio: solo si el archivo lleva su apellido.
  return norm(file).includes(norm(name.split(" ").pop())) || !EVENT.test(file);
};
function photo(x, name) {
  const p18 = x.q && personImg.get(x.q);
  if (okPhoto(p18, name)) return p18;
  return x.img && okPhoto(x.img, name) ? x.img : "";
}
for (const [t, p] of pages) {
  if (/^List of /i.test(t)) continue;
  let x = info.get(t) || {};
  // Solo nadadores (no entrenadores ni otras personas que acaben en la categoría).
  const isPro = [...p.unis].some((un) => proOf.has(t + "|" + un));
  if (x.desc && !/swim/i.test(x.desc)) { if (!isPro) continue; x = {}; } // página de otra persona: sin enlace ni foto

  const name = t.replace(/\s*\(.*\)$/, "");
  const cc = x.q ? country.get(personC.get(x.q)) || "" : "";
  const g = (x.q && personSex.get(x.q)) || p.g || "";
  for (const un of p.unis) (out[un] ||= []).push([name, x.link || (info.has(t) && x.q ? t : ""), photo(x, name), cc, g, proOf.get(t + "|" + un) || 0]);
}
for (const l of Object.values(out)) l.sort((a, b) => b[5] - a[5] || (b[2] ? 1 : 0) - (a[2] ? 1 : 0) || a[0].localeCompare(b[0]));
const total = Object.values(out).reduce((s, l) => s + l.length, 0);
console.log("universidades con nadadores en Wikipedia:", Object.keys(out).length, "· nadadores:", total, "· con foto:", Object.values(out).flat().filter((x) => x[2]).length, "· con país:", Object.values(out).flat().filter((x) => x[3]).length);
if (SOLO.length) { for (const [k, l] of Object.entries(out)) console.log(k, l.length, JSON.stringify(l.slice(0, 12))); process.exit(0); }
await writeFile("web/data/internacionales.json", JSON.stringify({ updated: new Date().toISOString().slice(0, 10), u: out }));
