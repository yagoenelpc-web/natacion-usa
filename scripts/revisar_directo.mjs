// Diagnóstico: cuántas filas lee la app en cada prueba de las competiciones en directo.
import { readFile } from "node:fs/promises";
import { parseIndex, parseEvent } from "../web/parser.js";
const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" };
const get = async (u) => { try { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) }); return r.ok ? await r.text() : ""; } catch { return ""; } };
const arch = JSON.parse(await readFile("web/data/archivo.json", "utf8"));
const urls = process.env.URLS ? process.env.URLS.split(/\s+/).filter(Boolean) : arch.meets.filter((m) => m.end >= "2026-11-19").map((m) => m.url.split("#")[0]);
let shown = 0;
for (const u of urls) {
  const html = await get(u);
  if (!html) { console.log("SIN INDICE", u); continue; }
  const meet = parseIndex(html, u);
  const evs = meet.sessions.flatMap((s) => s.events);
  const counts = [];
  for (const e of evs.slice(0, 40)) {
    const h = await get(e.url);
    const ev = h ? parseEvent(h, e.url) : null;
    const n = ev ? ev.results.length : -1;
    counts.push(n);
    if (n >= 0 && n <= 1 && shown < 4) { shown++; console.log("=== POCAS FILAS", n, e.url, "\n" + h.replace(/<[^>]+>/g, "").replace(/\r/g, "").split("\n").filter((l) => l.trim()).slice(0, 45).join("\n")); }
  }
  console.log("MEET", meet.name, "| pruebas", evs.length, "| filas:", counts.join(","), "|", u);
}
