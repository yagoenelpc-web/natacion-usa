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
