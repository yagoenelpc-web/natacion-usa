// Revisa las fotos de los nadadores: lee solo el principio de cada imagen para saber su tamaño y marca como malas
// las que no pueden ser una foto de cara (más anchas que altas, como un paisaje o una carretera; diminutas; o rotas).
// Guarda web/data/fotos-revisadas.json { u: { url: 1 buena | 0 mala } } y fix_keys.mjs quita las malas.
// Va por partes: las ya revisadas no se vuelven a pedir. MAX_MIN limita los minutos de cada ejecución.
import { readFile, writeFile, readdir } from "node:fs/promises";

const MAX_MIN = +(process.env.MAX_MIN || 25);
const T0 = Date.now();
const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" };
const J = async (f, d) => { try { return JSON.parse(await readFile("web/data/" + f, "utf8")); } catch { return d; } };

// Ancho y alto desde la cabecera de JPEG, PNG, GIF o WebP.
export function dims(b) {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b.length > 10 && b.toString("ascii", 0, 3) === "GIF") return [b.readUInt16LE(6), b.readUInt16LE(8)];
  if (b.length > 30 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const t = b.toString("ascii", 12, 16);
    if (t === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (t === "VP8L") { const v = b.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]; }
    if (t === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}
async function head(url) {
  try {
    const r = await fetch(url, { headers: { ...UA, Range: "bytes=0-131071" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (r.status === 404 || r.status === 410) return 0;
    if (!r.ok) return null; // fallo pasajero: se vuelve a probar otro día
    const reader = r.body.getReader();
    const parts = [];
    let n = 0;
    while (n < 131072) { const { done, value } = await reader.read(); if (done) break; parts.push(value); n += value.length; }
    reader.cancel().catch(() => {});
    const d = dims(Buffer.concat(parts.map((p) => Buffer.from(p))));
    if (!d) return null;
    const [w, h] = d;
    if (w < 40 || h < 40) return 0;
    // Las de Wikimedia (Wikidata) son del nadador aunque sean apaisadas (fotos de carrera o de podio).
    return w / h > 1.25 && !/wikimedia\.org/.test(url) ? 0 : 1;
  } catch { return null; }
}

const seen = (await J("fotos-revisadas.json", { u: {} })).u || {};
const urls = new Set();
for (const p of Object.values((await J("plantillas.json", {})).plant || {})) for (const l of Object.values(p)) for (const e of l) if (Array.isArray(e) && e[1]) urls.add(e[1]);
for (const m of Object.values((await J("fotos-pasadas.json", {})).u || {})) for (const img of Object.values(m)) if (img) urls.add(img);
for (const img of Object.values((await J("fotos-extra.json", {})).f || {})) if (img) urls.add(img);
for (const f of await readdir("web/data/bio").catch(() => [])) {
  const b = await J("bio/" + f, {});
  for (const grp of Object.values(b)) if (grp && typeof grp === "object") for (const x of Object.values(grp)) if (x?.img) urls.add(x.img);
}
const todo = [...urls].filter((u) => !(u in seen) && /^https?:/.test(u));
console.log("fotos:", urls.size, "· por revisar:", todo.length);
let i = 0, ok = 0, bad = 0;
await Promise.all(Array.from({ length: 16 }, async () => {
  while (i < todo.length && Date.now() - T0 < MAX_MIN * 60e3) {
    const u = todo[i++];
    const v = await head(u);
    if (v === null) continue;
    seen[u] = v;
    v ? ok++ : bad++;
  }
}));
for (const u of Object.keys(seen)) if (seen[u] && !urls.has(u)) delete seen[u];
await writeFile("web/data/fotos-revisadas.json", JSON.stringify({ updated: new Date().toISOString().slice(0, 10), u: seen }));
console.log("revisadas ahora:", ok + bad, "· buenas:", ok, "· malas (paisaje, diminutas o rotas):", bad, "· quedan:", todo.length - i);
