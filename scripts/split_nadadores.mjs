// Divide web/data/nadadores.json (completo, lo usan los scripts) en lo que carga la app:
// - web/data/nad-indice.json: lista ligera para buscar (nombre, equipo, sexo, curso y su mejor marca).
// - web/data/nad/<xx>.json: marcas y competiciones de cada nadador, repartidos en 256 trozos (solo se baja el trozo del nadador que abres).
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
const d = JSON.parse(await readFile("web/data/nadadores.json", "utf8"));
// Mismo cálculo que en la app (web/app.js → shardOf).
export const shardOf = (k) => { let h = 2166136261; for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) & 255).toString(16).padStart(2, "0"); };
const keyOf = (n, t) => (n + "|" + t).toLowerCase().replace(/\s+/g, " ");
const secs = (t) => { const m = /^(?:(\d+):)?(\d+\.\d+)/.exec(t || ""); return m ? (+m[1] || 0) * 60 + +m[2] : Infinity; };
// La prueba "estrella": la de mejor ritmo relativo (segundos por unidad de distancia).
const pace = ([ev, v]) => secs(v[0]) / (+(/^(\d+)/.exec(ev)?.[1]) || 100);
const idx = [], shards = {};
const mi = d.mi || {};
for (const s of d.swimmers) {
  const ent = Object.entries(s.b || {});
  const top = ent.sort((a, b) => pace(a) - pace(b))[0];
  idx.push([s.n, s.t, s.g || "", s.y || "", top ? top[0] : "", top ? top[1][0] : "", s.l || ""]);
  const sk = shardOf(keyOf(s.n, s.t));
  const sh = (shards[sk] ||= { s: {}, mi: {} });
  sh.s[keyOf(s.n, s.t)] = [s.b, s.m];
  for (const v of Object.values(s.b || {})) if (v[2] && mi[v[2]]) sh.mi[v[2]] = mi[v[2]];
  for (const x of s.m || []) if (mi[x]) sh.mi[x] = mi[x];
}
await rm("web/data/nad", { recursive: true, force: true });
await mkdir("web/data/nad", { recursive: true });
for (const [k, v] of Object.entries(shards)) await writeFile(`web/data/nad/${k}.json`, JSON.stringify(v));
await writeFile("web/data/nad-indice.json", JSON.stringify({ v: 1, updated: d.updated || new Date().toISOString().slice(0, 10), s: idx }));
console.log("índice:", idx.length, "nadadores ·", JSON.stringify(idx).length, "bytes · trozos:", Object.keys(shards).length);
