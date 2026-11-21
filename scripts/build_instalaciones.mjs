// Instalaciones de natación, Instagram del equipo y vídeo de cada universidad, leídos de su web oficial de deportes.
// Guarda solo datos sueltos (nombre de la piscina, carriles, medidas, aforo, año, foto y enlaces), nunca el texto.
// SOLO="Texas,Florida Tech" → prueba con esas universidades y lo imprime sin guardar.
import { readFile, writeFile } from "node:fs/promises";

const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" };
const unis = JSON.parse(await readFile("web/data/unis.json", "utf8")).unis;
const cal = JSON.parse(await readFile("web/data/calendario.json", "utf8").catch(() => "{}"));
const old = JSON.parse(await readFile("web/data/instalaciones.json", "utf8").catch(() => "{}"));
const SOLO = (process.env.SOLO || "").split(",").map((s) => s.trim()).filter(Boolean);

async function get(url) {
  try {
    const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const t = r.headers.get("content-type") || "";
    if (!/html/.test(t)) return null;
    return { url: r.url, html: (await r.text()).slice(0, 1_500_000) };
  } catch {
    return null;
  }
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      try { await fn(items[k]); } catch (e) { if (SOLO.length) console.log("error", items[k].n, e.message); }
    }
  }));
}
const dec = (s) => s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;|&#8217;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;|&#160;/g, " ").replace(/&#8211;|&ndash;/g, "-").replace(/\s+/g, " ").trim();
const abs = (h, base) => { try { return new URL(h.replace(/&amp;/g, "&"), base).href; } catch { return ""; } };
const NUM = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fourteen: 14, sixteen: 16, eighteen: 18, twenty: 20, "twenty-two": 22 };
const num = (s) => (/^\d+$/.test(s) ? +s : NUM[s.toLowerCase()] || 0);
const ogImage = (html, base) => { const m = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i.exec(html) || /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image/i.exec(html); return m ? abs(m[1], base) : ""; };
const POOLRE = /aquatic|natatorium|\bpool\b|swim(ming)? (center|complex|facility|stadium)|aquatics/i;

// Hechos de la piscina a partir del texto de su página.
function facts(text) {
  const f = {};
  const lanes = [...text.matchAll(/\b(\d{1,2}|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|sixteen|eighteen|twenty|twenty-two)[- ](?:competition |swimming |racing |short[- ]course |long[- ]course )?lanes?\b/gi)].map((m) => num(m[1])).filter((n) => n >= 4 && n <= 24);
  if (lanes.length) f.lanes = Math.max(...lanes);
  if (/\b25[- ]?(yards?|yd)\b/i.test(text)) f.y25 = 1;
  if (/\b25[- ]?(meters?|metres?|m)\b(?![a-z])/i.test(text)) f.m25 = 1;
  if (/\b50[- ]?(meters?|metres?|m)\b(?![a-z])|olympic[- ](size|length|sized)|long[- ]course/i.test(text)) f.m50 = 1;
  if (/\bdiving (well|tower|platform|boards?|pool|area)|\b(1|3|5|7\.5|10)[- ]?(meter|metre|m) (spring)?boards?|\bplatforms?\b.*\bdiv/i.test(text)) f.dive = 1;
  const seats = [...text.matchAll(/\b(\d{1,2},?\d{3}|\d{3})\s*(?:-|\s)?(?:spectator )?(?:seats?|seating|spectators|fans)\b|seating (?:capacity )?(?:of|for) (?:approximately |about |nearly |more than |over )?(\d{1,2},?\d{3}|\d{3})/gi)].map((m) => +(m[1] || m[2]).replace(",", "")).filter((n) => n >= 100 && n <= 20000);
  if (seats.length) f.seats = Math.max(...seats);
  const yr = /\b(?:opened|built|constructed|dedicated|completed|unveiled)(?: its doors)?(?: in)?(?: the)?(?: (?:fall|spring|summer|winter|january|february|march|april|may|june|july|august|september|october|november|december) (?:of )?)?\s*(19[3-9]\d|20[0-2]\d)\b/i.exec(text);
  if (yr) f.year = +yr[1];
  const gal = /\b(\d(?:\.\d+)?)[- ]million[- ]gallons?|\b(\d{3},\d{3}|\d,\d{3},\d{3})[- ]gallons?/i.exec(text);
  if (gal) f.gal = gal[1] ? `${gal[1]}M` : gal[2];
  return f;
}

// Instagram del equipo de natación (no el general de deportes).
function instagram(html) {
  const hs = [...new Set([...html.matchAll(/instagram\.com\/([A-Za-z0-9_.]{2,30})\/?["'?]/g)].map((m) => m[1]).filter((h) => !/^(p|explore|accounts|reel|stories|tv|sharer)$/i.test(h)))];
  return { swim: hs.find((h) => /swim|dive|sd$|_sd|aquatic/i.test(h)) || "", all: hs.filter((h) => !/swim|dive|aquatic/i.test(h)).slice(0, 1)[0] || "" };
}
// Primer vídeo de YouTube que aparezca en la página (incrustado o enlazado).
function youtube(html) {
  const m = /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(html);
  return m ? m[1] : "";
}

const out = {};
const todo = unis.filter((u) => !SOLO.length || SOLO.includes(u.n));
await pool(todo, 8, async (u) => {
  const srcs = (cal.src?.[u.n] || []).map((s) => s.split("|")[1]).filter(Boolean);
  const sport = srcs.map((s) => s.replace(/\/schedule.*$/, "")).filter((s, i, a) => a.indexOf(s) === i);
  let origin = "";
  try { origin = new URL(sport[0] || u.web).origin; } catch {}
  if (!origin) return;
  const r = {};
  // Página del deporte: Instagram, vídeo y enlaces a la piscina.
  const pages = [];
  for (const s of sport.length ? sport : [origin]) { const p = await get(s); if (p) pages.push(p); }
  let poolLinks = [];
  for (const p of pages) {
    const ig = instagram(p.html);
    r.ig ||= ig.swim;
    r.igAll ||= ig.all;
    r.yt ||= youtube(p.html);
    for (const m of p.html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) if (/facilit/i.test(m[1]) && POOLRE.test(dec(m[2]) + " " + m[1])) poolLinks.push([dec(m[2]), abs(m[1], p.url)]);
  }
  // Página general de instalaciones.
  if (!poolLinks.length) {
    for (const path of ["/facilities", "/sports/facilities", "/information/facilities"]) {
      const f = await get(origin + path);
      if (!f) continue;
      for (const m of f.html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi)) {
        const t = dec(m[2]);
        if (POOLRE.test(t) || (/facilities\/[^"']*(aquatic|natatorium|pool|swim)/i.test(m[1]) && t)) poolLinks.push([t, abs(m[1], f.url)]);
      }
      if (poolLinks.length) break;
    }
  }
  poolLinks = poolLinks.filter(([, h]) => h.startsWith(origin) && !/\.(pdf|jpe?g|png)$/i.test(h));
  const seen = new Set();
  for (const [t, h] of poolLinks) {
    if (seen.has(h) || seen.size >= 2) continue;
    seen.add(h);
    const p = await get(h);
    if (!p) continue;
    const title = dec((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(p.html) || [])[1] || "") || t;
    const name = (POOLRE.test(title) ? title : t).replace(/\s*[-|–].*$/, "").slice(0, 80).trim();
    const text = dec((/<main[\s\S]*?<\/main>/i.exec(p.html) || /<article[\s\S]*?<\/article>/i.exec(p.html) || [p.html])[0]);
    r.fac = { n: name, url: p.url, img: ogImage(p.html, p.url), ...facts(text) };
    r.yt ||= youtube(p.html);
    break;
  }
  if (r.ig || r.igAll || r.fac || r.yt) out[u.n] = Object.fromEntries(Object.entries(r).filter(([, v]) => v));
  if (SOLO.length) console.log(u.n, JSON.stringify(out[u.n] || null), "· enlaces piscina:", poolLinks.length);
});

if (SOLO.length) process.exit(0);
// Lo que no se pudo leer hoy se conserva de la vez anterior.
for (const [k, v] of Object.entries(old.u || {})) if (!out[k]) out[k] = v;
await writeFile("web/data/instalaciones.json", JSON.stringify({ updated: new Date().toISOString().slice(0, 10), u: out }));
const c = (f) => Object.values(out).filter(f).length;
console.log("instalaciones:", c((x) => x.fac), "· instagram natación:", c((x) => x.ig), "· vídeos:", c((x) => x.yt), "· carriles:", c((x) => x.fac?.lanes), "de", unis.length);
