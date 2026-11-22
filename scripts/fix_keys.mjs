// Nombres viejos de universidad que quedaron como llave en los datos ("Bowdoin Polar", "McMurry War", de cuando el nombre
// llevaba parte del apodo) → nombre actual de unis.json. Si ya hay datos con el nombre nuevo, se quedan los nuevos.
import { readFile, writeFile } from "node:fs/promises";
const J = async (f) => { try { return JSON.parse(await readFile("web/data/" + f, "utf8")); } catch { return null; } };
const unis = (await J("unis.json"))?.unis || [];
const names = new Set(unis.map((u) => u.n));
const byLen = [...names].sort((a, b) => b.length - a.length);
const fix = (k) => (names.has(k) ? k : byLen.find((n) => k.startsWith(n + " ")) || k);
const remap = (o) => {
  if (!o || typeof o !== "object") return 0;
  let n = 0;
  for (const k of Object.keys(o)) { const k2 = fix(k); if (k2 !== k) { if (!(k2 in o)) o[k2] = o[k]; delete o[k]; n++; } }
  return n;
};
const jobs = [["calendario.json", (d) => remap(d.cal) + remap(d.src)], ["plantillas.json", (d) => remap(d.plant)], ["fotos-pasadas.json", (d) => remap(d.u)], ["instalaciones.json", (d) => remap(d.u)], ["records.json", (d) => remap(d.u)]];
for (const [f, fn] of jobs) {
  const d = await J(f);
  if (!d) continue;
  const n = fn(d);
  if (n) { await writeFile("web/data/" + f, JSON.stringify(d)); console.log(f, "nombres corregidos:", n); }
}

// Fotos que no son del nadador: la silueta o el escudo que pone la web cuando no hay foto ("headshot_default",
// "placeholder", "person-default", el logo) y cualquier imagen repetida en dos personas distintas. También se quitan
// las "personas" que en realidad son un botón de la web ("Full Bio").
{
  const pl = await J("plantillas.json"), fp = await J("fotos-pasadas.json");
  const BADIMG = /default|placeholder|missing|dummy|no[-_]?photo|no[-_]?image|silhouette|[\/_-]blank[._-]|logo|head[-_]?shot[-_]?\d*[-_]?new|panther_head|spartan-head|withdoghead|HeadShot_300x450|resize\.jpe?g$/i;
  const BADNAME = /^(full bio|bio|view bio|read more|roster|headshot|photo)$/i;
  const who = new Map();
  const note = (img, n) => { if (!img) return; if (!who.has(img)) who.set(img, new Set()); who.get(img).add(n.toLowerCase()); };
  for (const p of Object.values(pl?.plant || {})) for (const l of Object.values(p)) for (const e of l) if (Array.isArray(e)) note(e[1], e[0]);
  for (const m of Object.values(fp?.u || {})) for (const [n, img] of Object.entries(m)) note(img, n);
  const rev = (await J("fotos-revisadas.json"))?.u || {};
  const bad = (img) => img && (rev[img] === 0 || BADIMG.test(decodeURIComponent(img).split("?url=").pop()) || (who.get(img)?.size || 0) > 1);
  let quitadas = 0, nombres = 0;
  if (pl) {
    for (const p of Object.values(pl.plant || {})) for (const [g, l] of Object.entries(p)) {
      p[g] = l.filter((e) => { const n = Array.isArray(e) ? e[0] : e; if (BADNAME.test(String(n).trim())) { nombres++; return false; } return true; });
      for (const e of p[g]) if (Array.isArray(e) && bad(e[1])) { e.length = 1; quitadas++; }
    }
    await writeFile("web/data/plantillas.json", JSON.stringify(pl));
  }
  if (fp) {
    for (const m of Object.values(fp.u || {})) for (const [n, img] of Object.entries(m)) { if (BADNAME.test(n.trim())) { delete m[n]; nombres++; } else if (bad(img)) { delete m[n]; quitadas++; } }
    await writeFile("web/data/fotos-pasadas.json", JSON.stringify(fp));
  }
  // Biografías y fotos de Wikidata: misma revisión.
  const { readdir } = await import("node:fs/promises");
  for (const f of await readdir("web/data/bio").catch(() => [])) {
    const b = await J("bio/" + f);
    if (!b) continue;
    let ch = 0;
    for (const grp of Object.values(b)) if (grp && typeof grp === "object") for (const x of Object.values(grp)) if (x?.img && (rev[x.img] === 0 || BADIMG.test(decodeURIComponent(x.img).split("?url=").pop()))) { delete x.img; ch++; }
    if (ch) { quitadas += ch; await writeFile("web/data/bio/" + f, JSON.stringify(b)); }
  }
  const fx = await J("fotos-extra.json");
  if (fx?.f) { let ch = 0; for (const [k, img] of Object.entries(fx.f)) if (rev[img] === 0) { delete fx.f[k]; ch++; } if (ch) { quitadas += ch; await writeFile("web/data/fotos-extra.json", JSON.stringify(fx)); } }
  console.log("fotos que no eran del nadador quitadas:", quitadas, "· nombres falsos quitados:", nombres);
}
