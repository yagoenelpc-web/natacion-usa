import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeMeetUrl, parseIndex, parseEvent, parseCatalog, uniqueEvents, isLive, organization } from "../../web/parser.js";

const FIX = new URL("../fixtures/", import.meta.url);
const read = (n) => readFileSync(new URL(n, FIX), "utf8");
const BASE = "https://swimmeetresults.tech/NCAA-Division-I-Men-2026/";

test("normalizeMeetUrl", () => {
  assert.equal(normalizeMeetUrl("swimmeetresults.tech/NCAA-Division-I-Men-2026"), BASE + "evtindex.htm");
  assert.equal(normalizeMeetUrl(BASE + "index.htm"), BASE + "evtindex.htm");
  assert.equal(normalizeMeetUrl(BASE + "evtindex.htm"), BASE + "evtindex.htm");
});

test("parseIndex", () => {
  const m = parseIndex(read("evtindex.htm"), BASE + "evtindex.htm");
  assert.match(m.name, /NCAA Division I Men/);
  assert.deepEqual([m.start, m.end], ["2026-03-25", "2026-03-28"]);
  assert.equal(m.lastEventUrl, BASE + "260325lastevt.htm");
  assert.deepEqual(m.sessions.map((s) => s.title), ["Session 1 - 10:00 AM", "Session 3 - 10:00 AM", "Session 4 - 6:03 PM"]);
  assert.equal(m.sessions[0].day, "Wednesday 3/25/2026");
  const fly = m.sessions[2].events[0];
  assert.deepEqual([fly.number, fly.name, fly.round, fly.url], [4, "Men 100 Fly Finals", "Finales", BASE + "260325F004.htm"]);
  assert.ok(m.sessions[0].events[1].relay);
  assert.equal(uniqueEvents(m).length, 7);
  assert.ok(isLive(m, "2026-03-26") && !isLive(m, "2026-04-01"));
});

test("parseIndex con el formato real (h2/h3 y font)", () => {
  const html = `<html><head><title>Index Page</title></head><body><font color="#CC0033">
<h2 align="center"><font color="#CC0033">2026 NCAA Division I Men's Swimming & Diving  </h2></font>
<p align="center">3/25/2026 - 3/28/2026<br>
<a href="260325lastevt.htm" target=main><font color="#0000FF">Latest Completed Event </a><br>
<h3>Session 1 - 10:00 AM<br>
Wednesday 3/25/2026</h3>
<a href="260325F001.htm" target=main>#1 Men 1650 Free </a><br>`;
  const m = parseIndex(html, BASE + "evtindex.htm");
  assert.equal(m.name, "2026 NCAA Division I Men's Swimming & Diving");
  assert.equal(m.sessions[0].day, "Wednesday 3/25/2026");
  assert.equal(m.sessions[0].events[0].name, "Men 1650 Free");
});

test("parseEvent individual", () => {
  const ev = parseEvent(read("event_100fly.htm"), BASE + "260325F004.htm");
  assert.equal(ev.number, 4);
  assert.equal(ev.title, "Men 100 Yard Butterfly");
  assert.match(ev.meetName, /NCAA Division I/);
  const r = ev.results[0];
  assert.deepEqual([r.p, r.n, r.y, r.t, r.pv, r.m, r.pts, r.s], ["1", "Liendo, Josh", "SR", "Florida", "42.54", "42.49N", "20", "Championship Final"]);
  assert.deepEqual(r.sp, ["9.02", "19.84", "31.05", "42.49"]);
  assert.deepEqual([ev.results[2].y, ev.results[2].t], ["5Y", "NC State"]);
  assert.equal(ev.results[4].t, "IU Indianapolis");
  assert.equal(ev.results[5].n, "Arkhangelskiy, Michel");
  assert.deepEqual([ev.results.at(-1).p, ev.results.at(-1).m], ["--", "DFS"]);
  assert.deepEqual(ev.scores[0], { p: 1, t: "Florida", pts: "119" });
  assert.deepEqual(ev.scores.at(-1), { p: 27, t: "Northwestern", pts: "2" });
  assert.equal(ev.results.length, 7);
});

test("parseEvent relevo real", () => {
  const ev = parseEvent(read("event_relay_real.htm"), BASE + "260325F002.htm");
  assert.ok(ev.relay);
  assert.equal(ev.results.length, 2);
  const a = ev.results[0];
  assert.deepEqual([a.p, a.t, a.times, a.pts], ["1", "ASU", ["1:20.56", "1:20.07M"], "40"]);
  assert.deepEqual(a.sw, ["Chaney, Adam", "Dobrzanski, Andy", "Kharun, Ilya", "Kulow, Jonny"]);
  assert.equal(a.sp.at(-1), "1:20.07");
});

test("parseEvent relevo con letra", () => {
  const ev = parseEvent(read("event_relay.htm"), BASE + "260325F002.htm");
  assert.deepEqual([ev.results[0].t, ev.results[0].l], ["Florida", "A"]);
  assert.equal(ev.results[2].m, "DQ");
});

test("parseEvent saltos", () => {
  const ev = parseEvent(read("event_diving.htm"), BASE + "260325F008.htm");
  assert.equal(ev.results.length, 4);
  assert.deepEqual(ev.results[0].times, ["379.65", "428.10"]);
  assert.equal(ev.results[1].t, "Miami (FL)");
});

test("parseCatalog", () => {
  const meets = parseCatalog(read("catalog.htm"), "https://swimmeetresults.tech/");
  assert.deepEqual(meets.map((m) => m.name), ["NCAA Division I Men - 2026", "Big Ten Championships - 2026", "USA Swimming Junior Nationals - 2025"]);
  assert.equal(meets[0].year, "2026");
  assert.equal(meets[0].url, "https://swimmeetresults.tech/NCAA-Division-I-Men-2026");
});

test("organization", () => {
  assert.equal(organization("NCAA Division I Men - 2027"), "ncaa");
  assert.equal(organization("USA Swimming Junior Nationals - 2025"), "usas");
  assert.equal(organization("USMS Spring Nationals - 2026"), "usms");
  assert.equal(organization("Big Ten Championships - 2026"), "conf");
});
