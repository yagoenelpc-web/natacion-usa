// Pruebas contra las webs reales. Solo se ejecutan con NATACION_LIVE=1 (en GitHub Actions).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCatalog, parseIndex, parseEvent, uniqueEvents, normalizeMeetUrl } from "../../web/parser.js";
import { buildIndex, matchTeam } from "../../web/logos.js";
import handler from "../../netlify/functions/fuente.mjs";

const live = process.env.NATACION_LIVE === "1";
const get = async (url) => {
  const r = await handler(new Request("https://x/api/fuente?url=" + encodeURIComponent(url)));
  assert.equal(r.status, 200, url);
  return r.text();
};

test("catálogo, campeonato y pruebas reales a través del proxy", { skip: !live }, async () => {
  const catalog = parseCatalog(await get("https://swimmeetresults.tech/"), "https://swimmeetresults.tech/");
  console.log("campeonatos en el catálogo:", catalog.length);
  assert.ok(catalog.length > 10);
  const url = normalizeMeetUrl("https://swimmeetresults.tech/NCAA-Division-I-Men-2026");
  const meet = parseIndex(await get(url), url);
  console.log(meet.name, meet.start, meet.end, uniqueEvents(meet).length, "pruebas");
  assert.ok(meet.start && uniqueEvents(meet).length > 20);
  let rows = 0;
  let relays = 0;
  for (const e of uniqueEvents(meet).slice(0, 12)) {
    const ev = parseEvent(await get(e.url), e.url);
    rows += ev.results.length;
    if (ev.relay && ev.results.length) relays++;
  }
  console.log("filas:", rows, "relevos con resultados:", relays);
  assert.ok(rows > 100 && relays > 0);
});

test("escudos de ESPN para las universidades de la NCAA", { skip: !live }, async () => {
  const payloads = [
    JSON.parse(await get("https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=1000")),
    JSON.parse(await get("https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/teams?limit=1000")),
  ];
  const idx = buildIndex(payloads);
  const names = ["Florida", "Texas", "ASU", "Arizona St", "NC State", "Indiana", "Stanford", "Cal", "Virginia", "Tennessee", "Miami (FL)", "IU Indianapolis", "Yale", "Navy"];
  const missing = names.filter((n) => !matchTeam(idx, n));
  console.log("universidades en el índice:", Object.keys(idx).length, "sin escudo:", missing);
  assert.ok(missing.length <= 2, missing.join(", "));
});

test("logos de NCAA y USA Swimming en Wikipedia", { skip: !live }, async () => {
  for (const page of ["National_Collegiate_Athletic_Association", "USA_Swimming"]) {
    const d = JSON.parse(await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${page}`));
    console.log(page, (d.thumbnail || {}).source);
    assert.ok((d.thumbnail || d.originalimage || {}).source);
  }
});

test("competiciones en directo desde el canal de SwimSwam", { skip: !live }, async () => {
  const { parseFeed } = await import("../../web/parser.js");
  const meets = [];
  for (const f of ["https://swimswam.com/feed/", "https://swimswam.com/tag/live-results/feed/"]) meets.push(...parseFeed(await get(f)));
  console.log("competiciones con resultados en SwimSwam:", meets.map((m) => `${m.name} → ${m.url}`));
  let ok = 0;
  for (const m of meets.slice(0, 6)) {
    try {
      const r = await handler(new Request("https://x/api/fuente?url=" + encodeURIComponent(m.url)));
      const meet = parseIndex(await r.text(), m.url);
      console.log(r.status, meet.name, meet.start, meet.end, uniqueEvents(meet).length, "pruebas");
      if (uniqueEvents(meet).length) ok++;
      if (meet.lastEventUrl) {
        const html = await (await handler(new Request("https://x/api/fuente?url=" + encodeURIComponent(meet.lastEventUrl)))).text();
        const ev = parseEvent(html, meet.lastEventUrl);
        const i = html.search(/Rankings|Scores/i);
        console.log("última prueba:", ev.title, "filas", ev.results.length, "clasificación", ev.scores.length, i >= 0 ? JSON.stringify(html.slice(i - 80, i + 400)) : "(sin clasificación)");
      }
    } catch (e) {
      console.log("fallo", m.url, e.message);
    }
  }
  console.log("competiciones legibles:", ok);
});
