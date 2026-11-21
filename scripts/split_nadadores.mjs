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

// Equipos: mejores tiempos de la temporada por prueba, con TODOS los resultados guardados de esta temporada
// (web/data/m/*.json, incluidos relevos) más las mejores marcas de nadadores.json.
import { norm } from "../web/logos.js";
import { readdir } from "node:fs/promises";
const now = new Date();
const seasonStart = `${now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1}-08-01`;
const slugT = (t) => norm(t).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";
const shortEv = (title) => title.replace(/^(Women|Men|Girls|Boys|Mixed)\s+/i, "").replace(/\s+Yard\s+/i, " Y ").replace(/\s+LC\s+Meter\s+|\s+SC\s+Meter\s+|\s+Meter\s+/i, " M ").replace(/Freestyle/i, "Free").replace(/Backstroke/i, "Back").replace(/Breaststroke/i, "Breast").replace(/Butterfly/i, "Fly").replace(/Individual Medley/i, "IM").replace(/\s+(Time Trial|Swim-?off|Prelims|Finals|Consolation|Bonus)\b.*$/i, "").trim();
const sexOfT = (t) => (/women|girls/i.test(t) ? "W" : /\bmen\b|boys/i.test(t) ? "M" : "");
const fixName = (n) => (n.includes(",") ? n.split(",").map((x) => x.trim()).filter(Boolean).reverse().join(" ") : n).replace(/\s+/g, " ").trim().replace(/\s+[A-Z]\.?(?=\s)/g, "");
const IND = /^\d+ [YM] (Free|Back|Breast|Fly|IM)$/, REL = /^\d+ [YM] (Free|Medley) Relay$/;
const teams = {};
const T0 = (raw) => (teams[slugT(raw)] ||= { n: raw, M: {}, W: {}, RM: {}, RW: {} });
const put = (bag, ev, t, who, extra) => {
  const k = typeof who === "string" ? who.toLowerCase() : who.join("|").toLowerCase();
  const l = (bag[ev] ||= new Map());
  const prev = l.get(k);
  if (!prev || secs(t) < secs(prev[0])) l.set(k, extra ? [t, who, extra] : [t, who]);
};
let mfiles = 0;
for (const f of await readdir("web/data/m").catch(() => [])) {
  let x;
  try { x = JSON.parse(await readFile("web/data/m/" + f, "utf8")); } catch { continue; }
  if (!x.d || x.d < seasonStart) continue;
  mfiles++;
  for (const ev of x.ev || []) {
    const g = sexOfT(ev.ti || ""), evn = shortEv(ev.ti || "");
    if (!g) continue;
    const rel = REL.test(evn);
    if (!rel && !IND.test(evn)) continue;
    for (const r of ev.res || []) {
      const [, n, team, , m] = r;
      const t = String(m || "").replace(/^[xX*]/, "").replace(/[A-Za-z!#$&*@^]+$/, "");
      if (!team || secs(t) === Infinity || /^(DQ|NS|SCR|DFS)/i.test(t)) continue;
      const dist = +evn.split(" ")[0];
      const pc = secs(t) / dist;
      if (pc < (rel ? 0.33 : 0.36) || pc > 1.4) continue;
      if (rel) { const sw = (r[8] || []).map(fixName); put(T0(team)["R" + g], evn, t, sw.length ? sw : [r[7] || "A"]); }
      else if (n && /^[\p{L}][\p{L}'’.,\- ]+$/u.test(n.trim())) put(T0(team)[g], evn, t, fixName(n));
    }
  }
}
for (const sw of d.swimmers) {
  const g = sw.g === "M" || sw.g === "W" ? sw.g : "";
  if (!g || !sw.t) continue;
  for (const [ev, v] of Object.entries(sw.b || {})) {
    if (!IND.test(ev)) continue;
    const dt = v[2] && mi[v[2]] ? mi[v[2]][1] : "";
    if (!dt || dt < seasonStart) continue;
    put(T0(sw.t)[g], ev, v[0], sw.n);
  }
}
await rm("web/data/equipos", { recursive: true, force: true });
await mkdir("web/data/equipos", { recursive: true });
const rank = {};
for (const [k, T] of Object.entries(teams)) {
  const out = { n: T.n, M: {}, W: {}, R: { M: {}, W: {} } }, best = { M: {}, W: {} };
  for (const g of ["M", "W"]) {
    for (const [ev, l] of Object.entries(T[g])) {
      const list = [...l.values()].sort((a, b) => secs(a[0]) - secs(b[0]));
      out[g][ev] = list.slice(0, 10);
      best[g][ev] = list.slice(0, 3).map((x) => x[0]);
    }
    for (const [ev, l] of Object.entries(T["R" + g])) {
      const list = [...l.values()].sort((a, b) => secs(a[0]) - secs(b[0]));
      out.R[g][ev] = list.slice(0, 3);
      best[g][ev] = [list[0][0]];
    }
  }
  if (!Object.keys(best.M).length && !Object.keys(best.W).length) continue;
  await writeFile(`web/data/equipos/${k}.json`, JSON.stringify(out));
  rank[k] = [T.n, best];
}
await writeFile("web/data/equipos-rank.json", JSON.stringify({ updated: new Date().toISOString().slice(0, 10), season: seasonStart, meets: mfiles, t: rank }));
console.log("equipos:", Object.keys(rank).length, "· competiciones de la temporada:", mfiles, "· ranking:", JSON.stringify(rank).length, "bytes");

// Alias de equipos: códigos de los resultados ("GAC-MN", "KEN", "Gusties-MN") → universidad, según en qué plantilla
// oficial (de este año o anteriores) salen sus nadadores. La app lo usa cuando el nombre no basta.
{
  const J = async (f) => JSON.parse(await readFile("web/data/" + f, "utf8").catch(() => "{}"));
  const [pl, past] = [(await J("plantillas.json")).plant || {}, (await J("fotos-pasadas.json")).u || {}];
  const low = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]+/g, " ").trim();
  const key = (n) => { const t = low(n).split(/\s+/).filter((x) => x.length > 1); return t.length < 2 ? "" : t[0] + "|" + t[t.length - 1]; };
  const who = new Map();
  const add = (uni, n) => { const k = key(n); if (!k) return; if (!who.has(k)) who.set(k, new Set()); who.get(k).add(uni); };
  for (const [uni, p] of Object.entries(pl)) for (const l of Object.values(p)) for (const e of l) add(uni, Array.isArray(e) ? e[0] : e);
  for (const [uni, m] of Object.entries(past)) for (const n of Object.keys(m)) add(uni, n);
  const byTeam = new Map();
  for (const s of d.swimmers) { if (!byTeam.has(s.t)) byTeam.set(s.t, []); byTeam.get(s.t).push(s.n); }
  const alias = {};
  for (const [t, ns] of byTeam) {
    const c = {};
    for (const n of ns) for (const u of who.get(key(n)) || []) c[u] = (c[u] || 0) + 1;
    const [best, hits] = Object.entries(c).sort((a, b) => b[1] - a[1])[0] || [];
    if (best && hits >= 3 && hits >= ns.length * 0.4) alias[t] = best;
  }
  await writeFile("web/data/alias-equipos.json", JSON.stringify({ updated: new Date().toISOString().slice(0, 10), a: alias }));
  console.log("alias de equipos:", Object.keys(alias).length, "de", byTeam.size);
}
