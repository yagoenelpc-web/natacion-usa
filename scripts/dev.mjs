// Servidor local para probar la app. Con MOCK=1 usa los ficheros de tests/fixtures
// en lugar de internet (útil donde no hay acceso a las webs de resultados).
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const web = join(root, "web");
const fx = (f) => readFile(join(root, "tests/fixtures", f), "utf8");
const MOCK = process.env.MOCK === "1";
const PORT = +(process.env.PORT || 8888);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };

const svg = (txt, bg) => "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M8 6h48v26c0 14-11 22-24 26C19 54 8 46 8 32z" fill="${bg}"/><text x="32" y="38" font-family="Arial" font-weight="700" font-size="16" fill="#fff" text-anchor="middle">${txt}</text></svg>`);
const MOCK_TEAMS = [["FLA", "Florida", "Gators", "#0021a5"], ["TEX", "Texas", "Longhorns", "#bf5700"], ["ASU", "Arizona St", "Sun Devils", "#8c1d40"], ["IND", "Indiana", "Hoosiers", "#990000"], ["NCST", "NC State", "Wolfpack", "#cc0000"], ["YALE", "Yale", "Bulldogs", "#00356b"], ["SMU", "SMU", "Mustangs", "#0033a0"], ["STAN", "Stanford", "Cardinal", "#8c1515"], ["TENN", "Tennessee", "Volunteers", "#ff8200"], ["UK", "Kentucky", "Wildcats", "#0033a0"]];

async function mock(url) {
  const u = new URL(url);
  if (u.hostname === "site.api.espn.com") {
    const teams = MOCK_TEAMS.map(([ab, loc, nm, c]) => ({ team: { abbreviation: ab, location: loc, shortDisplayName: loc, displayName: `${loc} ${nm}`, name: nm, color: c.slice(1), logos: [{ href: svg(ab.slice(0, 3), c) }] } }));
    return JSON.stringify({ sports: [{ leagues: [{ teams }] }] });
  }
  if (u.hostname === "en.wikipedia.org") {
    const k = u.pathname.split("/").pop();
    const lbl = { National_Collegiate_Athletic_Association: ["NCAA", "#005eb8"], USA_Swimming: ["USA", "#bf0d3e"], United_States_Masters_Swimming: ["USMS", "#00205b"] }[k] || ["?", "#777"];
    return JSON.stringify({ thumbnail: { source: "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="${lbl[1]}"/><text x="32" y="38" font-family="Arial" font-weight="700" font-size="${lbl[0].length > 3 ? 13 : 17}" fill="#fff" text-anchor="middle">${lbl[0]}</text></svg>`) } });
  }
  if (u.hostname === "swimswam.com") {
    const now = new Date().toUTCString();
    return `<rss><channel><item><title>2026 Tennessee Invitational: Day 3 Finals Live Recap</title><link>https://swimswam.com/ejemplo/</link><pubDate>${now}</pubDate><description>&lt;a href="https://sidearmstats.com/utennessee/swim/index.htm"&gt;Live Results&lt;/a&gt;</description></item></channel></rss>`;
  }
  const last = u.pathname.split("/").pop().toLowerCase();
  if (u.hostname === "sidearmstats.com" && last === "evtindex.htm") {
    const t = new Date().toISOString().slice(0, 10).split("-");
    return (await fx("evtindex.htm")).replace(/2026 NCAA Division I Men's Swimming &amp; Diving/, "2026 Tennessee Invitational").replace(/3\/25\/2026 - 3\/28\/2026/, `${+t[1]}/${+t[2]}/${t[0]} - ${+t[1]}/${+t[2]}/${t[0]}`);
  }
  if (u.pathname === "/" || u.pathname === "") return fx("catalog.htm");
  if (last === "evtindex.htm") {
    let html = await fx("evtindex.htm");
    if (/Big-Ten/i.test(u.pathname)) html = html.replace(/2026 NCAA Division I Men's Swimming &amp; Diving/, "2026 Big Ten Championships").replace(/3\/25\/2026 - 3\/28\/2026/, "2/25/2026 - 2/28/2026");
    if (/Junior/i.test(u.pathname)) html = html.replace(/2026 NCAA Division I Men's Swimming &amp; Diving/, "2025 USA Swimming Junior Nationals").replace(/2026/g, "2025");
    if (process.env.MOCK_LIVE && /NCAA/i.test(u.pathname) && u.hostname !== "sidearmstats.com") {
      const t = new Date().toISOString().slice(0, 10).split("-");
      html = html.replace(/3\/25\/2026 - 3\/28\/2026/, `${+t[1]}/${+t[2]}/${t[0]} - ${+t[1]}/${+t[2]}/${t[0]}`);
    }
    return html;
  }
  if (last.includes("lastevt") || last.endsWith("004.htm")) return fx("event_100fly.htm");
  if (last.endsWith("002.htm")) return fx("event_relay_real.htm");
  if (last.endsWith("008.htm")) return fx("event_diving.htm");
  return fx("event_relay.htm");
}

http
  .createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    try {
      if (u.pathname === "/api/fuente" || u.pathname === "/.netlify/functions/fuente") {
        const target = u.searchParams.get("url");
        if (MOCK) {
          res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
          return res.end(await mock(target));
        }
        const { default: handler } = await import("../netlify/functions/fuente.mjs");
        const r = await handler(new Request("http://x" + req.url));
        res.writeHead(r.status, Object.fromEntries(r.headers));
        return res.end(await r.text());
      }
      let path = normalize(decodeURIComponent(u.pathname)).replace(/^(\.\.[/\\])+/, "");
      if (path === "/") path = "/index.html";
      const file = join(web, path);
      if (!file.startsWith(web)) throw new Error("ruta");
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch (e) {
      res.writeHead(404);
      res.end("No encontrado");
    }
  })
  .listen(PORT, () => console.log(`Abre http://localhost:${PORT}${MOCK ? " (datos de prueba)" : ""}`));
