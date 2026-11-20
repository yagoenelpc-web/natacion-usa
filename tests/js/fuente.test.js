import { test } from "node:test";
import assert from "node:assert/strict";
import { allowed } from "../../netlify/functions/fuente.mjs";

test("el proxy solo permite las fuentes públicas previstas", () => {
  assert.ok(allowed("https://swimmeetresults.tech/NCAA-Division-I-Men-2026/evtindex.htm"));
  assert.ok(allowed("https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams"));
  assert.ok(allowed("https://en.wikipedia.org/api/rest_v1/page/summary/USA_Swimming"));
  assert.ok(!allowed("https://www.swimcloud.com/"));
  assert.ok(!allowed("https://evil.com/?swimmeetresults.tech"));
  assert.ok(!allowed("https://swimmeetresults.tech.evil.com/"));
  assert.ok(!allowed("file:///etc/passwd"));
  assert.ok(!allowed("no es una url"));
});
