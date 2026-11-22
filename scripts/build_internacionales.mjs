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
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(30000) }); if (r.ok) return await r.json(); if (r.status === 429) await sleep(5000); } catch {}
    await sleep(1000);
  }
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
console.log("categorías:", nCats, "· nadadores con página:", pages.size);
// Foto libre, id de Wikidata y descripción corta, de 50 en 50.
const titles = [...pages.keys()];
const info = new Map();
for (let i = 0; i < titles.length; i += 50) {
  const r = await wp({ action: "query", prop: "pageprops|pageimages|description", ppprop: "wikibase_item", piprop: "thumbnail", pithumbsize: "240", pilicense: "free", titles: titles.slice(i, i + 50).join("|"), redirects: "1" });
  const norm = new Map((r?.query?.redirects || []).map((x) => [x.to, x.from]));
  for (const p of r?.query?.pages || []) {
    const t = norm.get(p.title) || p.title;
    info.set(t, { q: p.pageprops?.wikibase_item, img: p.thumbnail?.source || "", desc: p.description || "" });
  }
}
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
const cs = [...new Set(personC.values())];
for (let i = 0; i < cs.length; i += 50) {
  const r = await wd({ action: "wbgetentities", ids: cs.slice(i, i + 50).join("|"), props: "claims" });
  for (const [q, e] of Object.entries(r?.entities || {})) { const iso = e.claims?.P297?.[0]?.mainsnak?.datavalue?.value; if (iso) country.set(q, iso.toLowerCase()); }
}
for (const [t, p] of pages) {
  const x = info.get(t) || {};
  // Solo nadadores (no entrenadores ni otras personas que acaben en la categoría).
  if (x.desc && !/swim/i.test(x.desc)) continue;
  const name = t.replace(/\s*\(.*\)$/, "");
  const cc = x.q ? country.get(personC.get(x.q)) || "" : "";
  const g = (x.q && personSex.get(x.q)) || p.g || "";
  for (const un of p.unis) (out[un] ||= []).push([name, t, x.img || "", cc, g]);
}
for (const l of Object.values(out)) l.sort((a, b) => (b[2] ? 1 : 0) - (a[2] ? 1 : 0) || a[0].localeCompare(b[0]));
const total = Object.values(out).reduce((s, l) => s + l.length, 0);
console.log("universidades con nadadores en Wikipedia:", Object.keys(out).length, "· nadadores:", total, "· con foto:", Object.values(out).flat().filter((x) => x[2]).length, "· con país:", Object.values(out).flat().filter((x) => x[3]).length);
if (SOLO.length) { for (const [k, l] of Object.entries(out)) console.log(k, l.length, JSON.stringify(l.slice(0, 12))); process.exit(0); }
await writeFile("web/data/internacionales.json", JSON.stringify({ updated: new Date().toISOString().slice(0, 10), u: out }));
