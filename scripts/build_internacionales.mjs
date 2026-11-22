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
const teamName = (u) => { const t = decodeURIComponent((u.wiki || "").split("/wiki/")[1] || "").replace(/_/g, " ").replace(/#.*$/, ""); return t; };
const out = {};
const pages = new Map(); // título → {g, unis:Set}
let nCats = 0;
for (const u of unis) {
  const base = teamName(u);
  const names = [...new Set([base, `${u.n} ${u.nick || ""}`.trim()].filter((x) => x && x.split(" ").length >= 2))];
  let found = false;
  for (const b of names) {
    for (const [cat, g] of [[`Category:${b} men's swimmers`, "M"], [`Category:${b} women's swimmers`, "W"], [`Category:${b} swimmers`, ""]]) {
      const l = await members(cat);
      if (!l.length) continue;
      found = true; nCats++;
      for (const t of l) { if (!pages.has(t)) pages.set(t, { g, unis: new Set() }); const p = pages.get(t); p.unis.add(u.n); if (g && !p.g) p.g = g; }
    }
    if (found) break;
  }
  if (SOLO.length) console.log(u.n, "·", names.join(" | "), "→", found ? "con categoría" : "sin categoría");
}
// Profesionales que entrenan ahora con el equipo de la universidad sin estudiar allí (grupos "pro"). Lista revisada a
// mano con su fuente; se marcan como "entrena aquí". [universidad, página de Wikipedia, fuente]
const PRO = [
  ["Texas", "Léon Marchand", "https://swimswam.com/leon-marchand-on-training-with-bowman-pro-group-in-austin-its-a-dream-to-be-here/"],
  ["Texas", "Tyler Ray (swimmer)", "https://swimswam.com/?p=1012413"],
  ["Texas", "Jack Wilkening", "https://swimswam.com/?p=1012413"],
  ["Texas", "Jack Aikins", "https://swimswam.com/?p=1012413"],
  ["Florida", "Caeleb Dressel", "https://swimswam.com/practice-pancakes-florida-pro-group-am-workout-with-dressel-ledecky-hinds/"],
  ["Florida", "Katie Ledecky", "https://swimswam.com/olympic-champion-katie-ledecky-heads-to-florida-to-train-under-anthony-nesty/"],
  ["Florida", "Natalie Hinds", "https://swimswam.com/practice-pancakes-florida-pro-group-am-workout-with-dressel-ledecky-hinds/"],
  ["Florida", "Bobby Finke", "https://sportskeeda.com/swimming/katie-ledecky-explored-training-caeleb-dressel-bobby-finke-like"],
  ["Virginia", "Isabelle Stadden", "https://swimswam.com/american-backstroker-isabelle-stadden-joins-virginia-pro-group"],
  ["Virginia Tech", "Carles Coll", "https://hokiesports.com/sports/swimming-diving/roster/player/carles-coll-marti"],
].filter(([u]) => !SOLO.length || SOLO.includes(u));
const proOf = new Map();
for (const [u, t] of PRO) {
  if (!pages.has(t)) pages.set(t, { g: "", unis: new Set() });
  pages.get(t).unis.add(u);
  proOf.set(t + "|" + u, 1);
}
console.log("categorías:", nCats, "· nadadores con página:", pages.size);
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
console.log("páginas con datos:", info.size, "de", titles.length);
// Nacionalidad (P1532 país para el deporte, si no P27 ciudadanía) → código ISO del país (P297).
const qs = [...new Set([...info.values()].map((x) => x.q).filter(Boolean))];
const country = new Map(), personC = new Map(), personSex = new Map();
for (let i = 0; i < qs.length; i += 50) {
  const r = await wd({ action: "wbgetentities", ids: qs.slice(i, i + 50).join("|"), props: "claims" });
  for (const [q, e] of Object.entries(r?.entities || {})) {
    const c = e.claims?.P1532?.[0]?.mainsnak?.datavalue?.value?.id || e.claims?.P27?.[0]?.mainsnak?.datavalue?.value?.id;
    if (c) personC.set(q, c);
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
for (const [t, p] of pages) {
  const x = info.get(t) || {};
  // Solo nadadores (no entrenadores ni otras personas que acaben en la categoría).
  if (x.desc && !/swim/i.test(x.desc) && ![...p.unis].some((un) => proOf.has(t + "|" + un))) continue;
  const name = t.replace(/\s*\(.*\)$/, "");
  const cc = x.q ? country.get(personC.get(x.q)) || "" : "";
  const g = (x.q && personSex.get(x.q)) || p.g || "";
  for (const un of p.unis) (out[un] ||= []).push([name, info.has(t) && x.q ? t : "", x.img || "", cc, g, proOf.get(t + "|" + un) || 0]);
}
for (const l of Object.values(out)) l.sort((a, b) => b[5] - a[5] || (b[2] ? 1 : 0) - (a[2] ? 1 : 0) || a[0].localeCompare(b[0]));
const total = Object.values(out).reduce((s, l) => s + l.length, 0);
console.log("universidades con nadadores en Wikipedia:", Object.keys(out).length, "· nadadores:", total, "· con foto:", Object.values(out).flat().filter((x) => x[2]).length, "· con país:", Object.values(out).flat().filter((x) => x[3]).length);
if (SOLO.length) { for (const [k, l] of Object.entries(out)) console.log(k, l.length, JSON.stringify(l.slice(0, 12))); process.exit(0); }
await writeFile("web/data/internacionales.json", JSON.stringify({ updated: new Date().toISOString().slice(0, 10), u: out }));
