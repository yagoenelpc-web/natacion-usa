// Biografías de nadadores y entrenadores desde su ficha en la web oficial de cada universidad.
// Entrada: web/data/enlaces-bio.json (lo genera build_calendario.mjs).
// Salida: web/data/bio/<universidad>.json → { p: { nombre: ficha }, c: { nombre: ficha } }
//   ficha = { b: texto de la biografía, f: [[dato, valor]...], img: foto, u: enlace a la ficha oficial }
// Va por partes (MAX_MIN minutos) y no repite fichas ya leídas (salvo cada 30 días).
import { readFile, writeFile, mkdir } from "node:fs/promises";

const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" };
const T0 = Date.now();
const MAX_MIN = +(process.env.MAX_MIN || 40);
const timeUp = () => Date.now() - T0 > MAX_MIN * 60e3;
const readJSON = async (f, d) => { try { return JSON.parse(await readFile(f, "utf8")); } catch { return d; } };
async function get(url) {
  try {
    const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(25000) });
    return r.ok ? await r.text() : null;
  } catch { return null; }
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length && !timeUp()) { const k = i++; try { await fn(items[k]); } catch {} }
  }));
}
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", hellip: "…" };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m));
// HTML de la biografía → texto con párrafos (los títulos en negrita quedan como "## Título").
function htmlToText(h) {
  return decode(
    h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi, "\n## $2\n")
      .replace(/<p[^>]*>\s*<(strong|b)>([^<]{2,80})<\/\1>\s*<\/p>/gi, "\n## $2\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n• ")
      .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t ]+/g, " ")
    .split("\n").map((l) => l.trim()).filter(Boolean).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Webs nuevas de Sidearm (Nuxt): los datos van en __NUXT_DATA__ (formato "devalue": una lista donde los objetos apuntan a posiciones).
function nuxtPeople(html, want) {
  const m = /<script[^>]+id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return [];
  let arr;
  try { arr = JSON.parse(m[1]); } catch { return []; }
  const seen = new Map();
  const res = (i, depth = 0) => {
    if (typeof i !== "number" || depth > 6) return i;
    if (i < 0) return undefined;
    if (seen.has(i)) return seen.get(i);
    const v = arr[i];
    if (Array.isArray(v)) {
      if (typeof v[0] === "string" && /^(Reactive|ShallowReactive|Ref|ShallowRef)$/.test(v[0])) return res(v[1], depth + 1);
      if (v[0] === "Date") return v[1];
      return v.map((x) => res(x, depth + 1));
    }
    if (v && typeof v === "object") {
      const o = {};
      seen.set(i, o);
      for (const [k, x] of Object.entries(v)) o[k] = res(x, depth + 1);
      return o;
    }
    return v;
  };
  const out = [];
  arr.forEach((v, i) => {
    if (v && typeof v === "object" && !Array.isArray(v) && "firstName" in v && "lastName" in v) {
      const o = res(i);
      const full = `${o.firstName || ""} ${o.lastName || ""}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]+/g, "");
      if (want && full !== want) return;
      out.push(o);
    }
  });
  return out;
}
const FIELDS = [["hometown", "Ciudad"], ["highSchool", "Instituto"], ["previousSchool", "Universidad anterior"], ["major", "Carrera"], ["positionLong", "Especialidad"], ["academicYearLong", "Curso"], ["title", "Cargo"], ["almaMater", "Universidad donde estudió"], ["experience", "Experiencia"]];
function fromNuxt(html, url) {
  // La persona de la ficha: su nombre va en el enlace (/roster/kale-barnes/15175).
  const want = (/\/(?:coaches\/)?([a-z0-9-]+)\/\d+\/?(?:\?.*)?$/i.exec(url)?.[1] || "").replace(/[^a-z]/gi, "").toLowerCase();
  const people = nuxtPeople(html, want);
  if (!people.length) return null;
  const score = (o) => String(o.bio || o.biography || "").length + Object.values(o).filter((x) => typeof x === "string" && x).length;
  const p = people.sort((a, b) => score(b) - score(a))[0];
  if (process.env.PROBE) console.log("claves:", Object.keys(p).filter((k) => p[k] != null && p[k] !== "").join(","), "| image:", JSON.stringify(p.image)?.slice(0, 300));
  const f = [];
  for (const [k, l] of FIELDS) if (typeof p[k] === "string" && p[k].trim() && p[k].length < 120) f.push([l, decode(p[k].trim())]);
  if (p.heightFeet) f.push(["Altura", `${p.heightFeet}' ${p.heightInches || 0}"`]);
  // Algunas webs guardan la biografía por apartados (bioFields: título + texto).
  let extra = "";
  for (const k of ["bioFields", "rankedBioFields", "historicalFields"]) {
    if (!Array.isArray(p[k])) continue;
    for (const it of p[k]) {
      if (!it || typeof it !== "object") continue;
      const label = [it.title, it.label, it.name, it.fieldName].find((x) => typeof x === "string" && x.trim());
      const val = [it.value, it.content, it.text, it.fieldValue, it.bio].find((x) => typeof x === "string" && x.trim());
      if (!val) continue;
      const txt = htmlToText(val);
      if (txt.length > 140) extra += `\n## ${label || ""}\n${txt}`;
    }
  }
  if (process.env.PROBE && (p.bioFields || p.rankedBioFields)) console.log("bioFields:", JSON.stringify(p.bioFields || p.rankedBioFields).slice(0, 600));
  const im = p.image && typeof p.image === "object" ? p.image : null;
  let img = im ? im.absoluteUrl || im.url || "" : typeof p.image === "string" ? p.image : "";
  if (img && !/^https?:/.test(img)) img = new URL(img, url).href;
  return { b: (htmlToText(String(p.bio || p.biography || "")) + extra).replace(/^Follow @\S+\n/, "").trim(), f, img };
}
// Webs clásicas y otras: bloque de biografía y datos con etiqueta.
function fromHtml(html) {
  const f = [];
  const LABELS = { Hometown: "Ciudad", "High School": "Instituto", "Previous School": "Universidad anterior", Major: "Carrera", Position: "Especialidad", Class: "Curso", "Academic Year": "Curso", Year: "Curso", Height: "Altura", "Alma Mater": "Universidad donde estudió", Title: "Cargo", Experience: "Experiencia" };
  for (const [en, es] of Object.entries(LABELS)) {
    const m = new RegExp(`>\\s*${en}:?\\s*<\\/(?:dt|span|strong|b|th|div|label)>\\s*(?:<[^>]+>\\s*)*([^<]{2,100})<`, "i").exec(html);
    if (m && !f.some(([l]) => l === es)) f.push([es, decode(m[1].trim())]);
  }
  const blocks = [
    /<div[^>]+(?:id|class)="[^"]*(?:sidearm-roster-player-bio|sidearm-coach-bio|roster-bio|bio-content|player-bio|coach-bio|s-person-bio)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
    /<div[^>]+(?:id|class)="[^"]*\bbio\b[^"]*"[^>]*>([\s\S]{200,40000}?)<\/div>/i,
  ];
  let b = "";
  for (const re of blocks) { const m = re.exec(html); if (m) { b = htmlToText(m[1]); if (b.length > 80) break; } }
  const img = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1] || "";
  return b.length > 80 || f.length ? { b, f, img } : null;
}

const links = process.env.URLS ? { Prueba: { p: Object.fromEntries(process.env.URLS.split(/\s+/).filter(Boolean).map((u, i) => [String(i), u])) } } : await readJSON("web/data/enlaces-bio.json", {});
if (process.env.URLS) process.env.PROBE ||= "50";
await mkdir("web/data/bio", { recursive: true });
const slug = (n) => n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const files = new Map();
const todo = [];
for (const [uni, { p = {}, c = {} }] of Object.entries(links)) {
  const cur = await readJSON(`web/data/bio/${slug(uni)}.json`, { p: {}, c: {} });
  files.set(uni, cur);
  for (const [k, list] of [["p", p], ["c", c]]) for (const [n, u] of Object.entries(list)) {
    const old = cur[k][n];
    if (old && old.u === u && Date.now() - (old.d || 0) < 30 * 864e5) continue;
    todo.push({ uni, k, n, u });
  }
}
// Entrenadores primero (son pocos) y después nadadores.
todo.sort((a, b) => (a.k === b.k ? 0 : a.k === "c" ? -1 : 1));
if (process.env.PROBE) todo.splice(+process.env.PROBE);
console.log("fichas por leer:", todo.length);
let ok = 0, none = 0, fail = 0, shown = 0;
await pool(todo, 10, async (t) => {
  const html = await get(t.u);
  if (!html) { fail++; return; }
  const r = fromNuxt(html, t.u) || fromHtml(html);
  if (!r) { none++; files.get(t.uni)[t.k][t.n] = { u: t.u, d: Date.now() }; return; }
  if (r.b.length > 6000) r.b = r.b.slice(0, 6000).replace(/\s+\S*$/, "") + "…";
  files.get(t.uni)[t.k][t.n] = { ...(r.b ? { b: r.b } : {}), ...(r.f.length ? { f: r.f } : {}), ...(r.img ? { img: r.img } : {}), u: t.u, d: Date.now() };
  ok++;
  if (process.env.PROBE && shown++ < 6) console.log("== ", t.k, t.n, t.u, "\n", JSON.stringify(r.f), "\n", r.b.slice(0, 700));
});
if (!process.env.URLS) for (const [uni, cur] of files) if (Object.keys(cur.p).length || Object.keys(cur.c).length) await writeFile(`web/data/bio/${slug(uni)}.json`, JSON.stringify(cur));
console.log("leídas:", ok, "sin biografía:", none, "fallos:", fail, "· minutos:", ((Date.now() - T0) / 60e3).toFixed(1));
const all = [...files.values()];
console.log("total con biografía · nadadores:", all.reduce((a, f) => a + Object.values(f.p).filter((x) => x.b).length, 0), "entrenadores:", all.reduce((a, f) => a + Object.values(f.c).filter((x) => x.b).length, 0), "entrenadores con foto:", all.reduce((a, f) => a + Object.values(f.c).filter((x) => x.img).length, 0));
