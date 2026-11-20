// Completa web/data/unis.json con datos fiables:
// - webs oficiales (universidad y deportes) desde Wikidata (CC0), comprobadas una a una;
// - escudos que faltan (imagen principal del artículo de Wikipedia, también logos no libres);
// - equipo técnico (nombre, cargo y correo) de la página pública de entrenadores de la web deportiva;
// - enlace a la plantilla oficial y a los resultados en directo de HY-TEK (sidearmstats) si existen.
import { readFile, writeFile } from "node:fs/promises";

const FILE = process.argv[2] || "web/data/unis.json";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const BOT = { "User-Agent": "natacion-usa/0.6 (app personal; datos abiertos)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const data = JSON.parse(await readFile(FILE, "utf8"));
const unis = data.unis;

async function getJSON(url, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: BOT, signal: AbortSignal.timeout(30000) });
      if (r.ok) return await r.json();
      if (r.status === 429) await sleep((+r.headers.get("retry-after") || 10) * 1000);
    } catch {}
    await sleep(2000 * (i + 1));
  }
  return null;
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      try { await fn(items[k], k); } catch {}
    }
  }));
}
const titleOf = (wiki) => decodeURIComponent((wiki || "").split("/wiki/")[1] || "").replace(/_/g, " ");
const athTitle = (t) => t.replace(/\s+(men's\s+and\s+women's\s+|men's\s+|women's\s+)?swimming(\s+and\s+diving)?$/i, "").trim();

// 0) Artículos equivocados (p. ej. Tampa → "Spartans"): el título debe contener el nombre de la universidad.
const STOP = /^(university|college|state|of|the|at|and|saint|st\.?|institute|technology)$/i;
const words = (x) => (x || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.test(w));
let fixedTitles = 0;
for (const u of unis) {
  const t = titleOf(u.wiki).toLowerCase();
  const key = [...words(u.n), ...words(u.full)];
  if (key.length && !key.some((w) => t.includes(w))) {
    u.wiki = "https://en.wikipedia.org/wiki/" + encodeURIComponent(`${u.n} ${u.nick || ""}`.trim().replace(/ /g, "_"));
    delete u.logo; delete u.web;
    u._badLogo = true;
    fixedTitles++;
  }
}
console.log("artículos corregidos:", fixedTitles, unis.filter((u) => u._badLogo).map((u) => u.n).join(", "));

// 1) Wikidata: webs y logos.
const titles = new Set();
for (const u of unis) {
  const t = titleOf(u.wiki);
  u._t = [t, athTitle(t), !u.logo && u.nick ? `${u.n} ${u.nick}` : "", !u.logo && u.nick ? `${u.full.replace(/^(The )?University of /i, "").replace(/ (University|College)$/i, "")} ${u.nick}` : ""].filter(Boolean);
  u._i = u.full;
  for (const x of [...u._t, u._i]) titles.add(x);
}
const list = [...titles];
const ent = {};
for (let i = 0; i < list.length; i += 50) {
  const chunk = list.slice(i, i + 50);
  const d = await getJSON("https://www.wikidata.org/w/api.php?" + new URLSearchParams({ action: "wbgetentities", sites: "enwiki", titles: chunk.join("|"), props: "claims|sitelinks", sitefilter: "enwiki", format: "json" }));
  for (const e of Object.values(d?.entities || {})) {
    const t = e.sitelinks?.enwiki?.title;
    if (!t) continue;
    const val = (p) => (e.claims?.[p] || []).filter((c) => c.rank !== "deprecated").map((c) => c.mainsnak?.datavalue?.value).filter(Boolean);
    ent[t] = { web: val("P856")[0] || "", logo: val("P154")[0] || "", email: (val("P968")[0] || "").replace(/^mailto:/, "") };
  }
  await sleep(800);
}
// Títulos normalizados/redirigidos: resolver con la API de Wikipedia.
const red = {};
for (let i = 0; i < list.length; i += 50) {
  const chunk = list.slice(i, i + 50);
  const d = await getJSON("https://en.wikipedia.org/w/api.php?" + new URLSearchParams({ action: "query", titles: chunk.join("|"), redirects: "1", prop: "pageimages", piprop: "thumbnail|name", pithumbsize: "200", pilicense: "any", format: "json", formatversion: "2" }));
  const norm = new Map((d?.query?.normalized || []).map((x) => [x.from, x.to]));
  const rd = new Map((d?.query?.redirects || []).map((x) => [x.from, x.to]));
  const pages = new Map((d?.query?.pages || []).map((p) => [p.title, p]));
  for (const t of chunk) {
    let k = norm.get(t) || t;
    k = rd.get(k) || k;
    red[t] = { title: k, img: pages.get(k)?.thumbnail?.source || "" };
  }
  await sleep(800);
}
const info = (t) => ent[red[t]?.title || t] || ent[t] || {};
const commons = (f) => f ? "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(f.replace(/ /g, "_")) + "?width=200" : "";
let newLogos = 0;
for (const u of unis) {
  const a = u._t.map(info).find((x) => x.web) || {};
  const inst = info(u._i);
  u._aweb = a.web || "";
  u._uweb = inst.web || "";
  if (inst.email) u.email = inst.email;
  if (!u.logo) {
    const img = u._t.map((t) => red[t]?.img).find(Boolean) || commons(u._t.map(info).find((x) => x.logo)?.logo);
    if (img) { u.logo = img; newLogos++; }
  }
  if (!u.seal) u.seal = red[u._i]?.img || commons(inst.logo);
}
console.log("wikidata:", Object.keys(ent).length, "webs deportivas:", unis.filter((u) => u._aweb).length, "webs universidad:", unis.filter((u) => u._uweb).length, "escudos nuevos:", newLogos);

// 2) Comprobar webs (y descubrir la web deportiva si Wikidata no la tiene, a partir de la anterior).
async function alive(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
    const ok = r.ok || r.status === 403 || r.status === 429;
    return ok ? { url: r.ok ? r.url.replace(/\/+$/, "") : url, html: r.ok ? await r.text() : "", status: r.status } : null;
  } catch { return null; }
}
const clean = (w) => !w ? "" : (w.startsWith("http") ? w : "https://" + w).replace(/,$/, "").replace(/\/+$/, "");
const OLD = (u) => u._badLogo ? "" : /wikipedia|usnews|archive\.org|\.pdf$|\/(x|news|search|documents)\//i.test(u.web || "") ? "" : u.web;
let webOk = 0, athOk = 0;
await pool(unis, 12, async (u) => {
  const cands = [...new Set([clean(u._aweb), clean(OLD(u))].filter(Boolean))];
  for (const c of cands) {
    const r = await alive(c);
    if (r) { u._ath = r; break; }
  }
  const uw = clean(u._uweb);
  if (uw && !(u._ath && new URL(u._ath.url).host === new URL(uw).host)) {
    const r = await alive(uw);
    if (r) u.uweb = r.url;
  }
  if (u._ath) { u.web = u._ath.url; athOk++; } else if (u.uweb) { u.web = u.uweb; delete u.uweb; } else delete u.web;
  if (u.web) webOk++;
});
console.log("webs que funcionan:", webOk, "de deportes:", athOk);

// 3) Equipo técnico desde la página pública de entrenadores.
const PATHS = {
  "": ["/sports/swimming-and-diving", "/sports/swimming", "/sports/swim-and-dive", "/sports/swimming-diving", "/sports/swim"],
  M: ["/sports/mens-swimming-and-diving", "/sports/mens-swimming", "/sports/m-swim"],
  W: ["/sports/womens-swimming-and-diving", "/sports/womens-swimming", "/sports/w-swim"],
};
const NAME = /^[A-Z][A-Za-z'’.\-]+(?:\s+(?:[A-Z][A-Za-z'’.\-]+|de|van|von|da|del|la|Jr\.?|III|II|IV)){1,3}$/;
const ROLE = /coach|director|coordinator|operations|graduate assistant|manager|trainer/i;
const BAD = /coach|swim|diving|staff|director|roster|head|university|college|athletics|sports|email|phone|schedule|news|tickets|menu|skip|print|view|bio|full/i;
const text = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, "\n").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;|&#8217;/g, "'").split("\n").map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
function staffFrom(html) {
  const out = [];
  const seen = new Set();
  const add = (n, t, e) => {
    if (!n || seen.has(n) || !NAME.test(n) || BAD.test(n) || !t || t.length > 80) return;
    seen.add(n);
    out.push({ n, t, ...(e ? { e } : {}) });
  };
  // a) Filas de tabla.
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map((c) => text(c).join(" "));
    const e = /mailto:([\w.+\-]+@[\w.\-]+\.\w+)/i.exec(tr)?.[1] || "";
    const n = cells.find((c) => NAME.test(c) && !BAD.test(c));
    const t = cells.find((c) => ROLE.test(c) && c.length < 80);
    if (n && t) add(n, t, e);
  }
  if (out.length) return out;
  // b) Tarjetas: nombre y cargo cerca de cada correo.
  const parts = html.split(/(?=mailto:)/i);
  for (let i = 1; i < parts.length; i++) {
    const e = /^mailto:([\w.+\-]+@[\w.\-]+\.\w+)/i.exec(parts[i])?.[1];
    if (!e) continue;
    const toks = text(parts[i - 1].slice(-2500));
    const ti = toks.map((x, k) => (ROLE.test(x) && x.length < 80 ? k : -1)).filter((k) => k >= 0).pop();
    if (ti == null) continue;
    let n = "";
    for (let d = 1; d <= 6 && !n; d++) for (const j of [ti - d, ti + d]) if (toks[j] && NAME.test(toks[j]) && !BAD.test(toks[j])) { n = toks[j]; break; }
    add(n, toks[ti], e);
  }
  return out;
}
let staffN = 0, rosterN = 0;
const withAth = unis.filter((u) => u._ath && u._ath.status === 200);
await pool(withAth, 10, async (u) => {
  const base = u._ath.url.replace(/^(https?:\/\/[^/]+).*$/, "$1");
  const want = u.men && u.women ? ["", "M", "W"] : u.men ? ["M", ""] : ["W", ""];
  const staff = [];
  for (const who of want) {
    if (who && staff.length && !(u.men && u.women)) break;
    for (const p of PATHS[who]) {
      try {
        const r = await fetch(base + p + "/coaches", { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(15000) });
        if (!r.ok || !/coaches/.test(r.url)) continue;
        const s = staffFrom(await r.text());
        if (!s.length) continue;
        for (const x of s) if (!staff.some((y) => y.n === x.n)) staff.push(who ? { ...x, g: who } : x);
        u[who ? "staff" + who + "Url" : "staffUrl"] = r.url;
        const rr = await fetch(base + p + "/roster", { method: "HEAD", headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(10000) }).catch(() => null);
        if (rr?.ok && /roster/.test(rr.url)) { u[who ? "roster" + who + "Url" : "rosterUrl"] = rr.url; rosterN++; }
        break;
      } catch {}
    }
    if (!who && staff.length) break;
  }
  if (staff.length) {
    const head = (x) => /^head|head (swimming |swim |diving )?coach|director of (swimming|aquatics)/i.test(x.t) && !/assoc|assist|diving coach$/i.test(x.t);
    staff.sort((a, b) => head(b) - head(a));
    u.staff = staff.slice(0, 12);
    const h = staff.filter(head);
    if (h.length) {
      const hm = h.find((x) => x.g === "M"), hw = h.find((x) => x.g === "W");
      if (hm && hw && hm.n !== hw.n) { u.coachM = hm.n; u.coachW = hw.n; delete u.coach; }
      else { u.coach = h[0].n; delete u.coachM; delete u.coachW; }
    }
    staffN++;
  }
});
console.log("con equipo técnico:", staffN, "con plantilla oficial:", rosterN, "de", withAth.length);

// 4) Resultados HY-TEK en sidearmstats: probar el nombre corto de la web deportiva.
const slugs = (u) => {
  const host = new URL(u.web || "https://x.y").host.replace(/^www\./, "");
  const stem = host.split(".")[0];
  const s = [stem, u.n.toLowerCase().replace(/[^a-z]/g, "")];
  const m = /^(.*?)(athletics|sports|panthers|tigers|bears|eagles|lions|knights|bulldogs|wildcats|mustangs|hawks|falcons|cardinals|owls|rams|huskies|spartans|pioneers|saints|gators|seminoles|lords|ladies|devils)$/.exec(stem);
  if (m && m[1].length >= 2) s.push(m[1]);
  return [...new Set(s)].filter((x) => x.length >= 2);
};
let hy = 0;
await pool(unis.filter((u) => u.web), 12, async (u) => {
  for (const s of slugs(u)) {
    try {
      const r = await fetch(`https://www.sidearmstats.com/${s}/swim/evtindex.htm`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) });
      if (r.ok && /HY-TEK|evtindex|Event\s+\d|<a href/i.test(await r.text())) { u.hytek = s; hy++; return; }
    } catch {}
  }
});
console.log("con resultados en sidearmstats:", hy, unis.filter((u) => u.hytek).slice(0, 30).map((u) => u.n + "=" + u.hytek).join(" "));

for (const u of unis) {
  delete u._t; delete u._i; delete u._aweb; delete u._uweb; delete u._ath; delete u._badLogo;
  for (const k of Object.keys(u)) if (u[k] === "" || u[k] == null) delete u[k];
}
console.log("ejemplos:", JSON.stringify(unis.filter((u) => ["Texas", "Kenyon", "Drury", "SMU", "Florida", "Queens (NC)"].includes(u.n))).slice(0, 4000));
console.log("datos:", { total: unis.length, logo: unis.filter((u) => u.logo).length, web: unis.filter((u) => u.web).length, staff: unis.filter((u) => u.staff).length, email: unis.filter((u) => u.staff?.some((x) => x.e)).length, coach: unis.filter((u) => u.coach || u.coachM).length });
data.updated = new Date().toISOString().slice(0, 10);
data.source = "Wikipedia (CC BY-SA 4.0), Wikidata (CC0) y webs oficiales de cada universidad";
await writeFile(FILE, JSON.stringify(data));
