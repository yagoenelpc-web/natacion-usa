// Fotos que faltan: nadadores que tienen foto en Wikidata/Wikimedia Commons (licencia libre).
// Solo nombre completo exacto y nadadores nacidos de 1994 en adelante, para no confundir personas.
// Salida: web/data/fotos-extra.json → { updated, f: { "nombre normalizado": url } }
import { readFile, writeFile } from "node:fs/promises";
const UA = { "User-Agent": "natacion-app/1.0 (personal app)", Accept: "application/sparql-results+json" };
const key = (n) => n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
const idx = JSON.parse(await readFile("web/data/nad-indice.json", "utf8"));
const want = new Set(idx.s.map((s) => key(s[0])));
// Foto (P18) y país de nacionalidad (P27 → código ISO P297), los dos opcionales.
const q = `SELECT ?p ?label ?img ?cc ?birth WHERE {
  ?p wdt:P106 wd:Q10843402; wdt:P569 ?birth; rdfs:label ?label.
  FILTER(LANG(?label) = "en") FILTER(YEAR(?birth) >= 1994)
  OPTIONAL { ?p wdt:P18 ?img. }
  OPTIONAL { ?p wdt:P27 ?c. ?c wdt:P297 ?cc. }
}`;
const r = await fetch("https://query.wikidata.org/sparql?query=" + encodeURIComponent(q), { headers: UA, signal: AbortSignal.timeout(120000) });
if (!r.ok) { console.log("wikidata:", r.status); process.exit(0); }
const rows = (await r.json()).results.bindings;
const byName = new Map();
for (const b of rows) {
  const k = key(b.label.value);
  if (!want.has(k)) continue;
  const cur = byName.get(k);
  if (cur && cur.p !== b.p.value) { cur.dup = true; continue; } // dos personas con el mismo nombre: no se usa
  const v = cur || { p: b.p.value, img: "", cc: new Set() };
  if (b.img?.value && !v.img) v.img = b.img.value.replace(/^http:/, "https:");
  if (b.cc?.value) v.cc.add(b.cc.value.toUpperCase());
  byName.set(k, v);
}
const f = {}, c = {};
for (const [k, v] of byName) {
  if (v.dup) continue;
  if (v.img) f[k] = v.img + "?width=300";
  if (v.cc.size === 1) c[k] = [...v.cc][0]; // con dos nacionalidades no se elige ninguna
}
await writeFile("web/data/fotos-extra.json", JSON.stringify({ updated: new Date().toISOString().slice(0, 10), f, c }));
console.log("nacionalidades de Wikidata:", Object.keys(c).length);
console.log("nadadores en Wikidata con foto:", rows.length, "· coinciden con la app:", Object.keys(f).length, Object.keys(f).slice(0, 15).join(", "));
