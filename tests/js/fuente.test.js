import { test } from "node:test";
import assert from "node:assert/strict";
import { allowed } from "../../netlify/functions/fuente.mjs";

test("el proxy solo permite las fuentes públicas previstas", () => {
  assert.ok(allowed("https://swimmeetresults.tech/NCAA-Division-I-Men-2026/evtindex.htm"));
  assert.ok(allowed("https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams"));
  assert.ok(allowed("https://en.wikipedia.org/api/rest_v1/page/summary/USA_Swimming"));
  assert.ok(allowed("https://swimswam.com/feed/"));
  assert.ok(allowed("https://sidearmstats.com/utennessee/swim/evtindex.htm"));
  assert.ok(allowed("https://sidearmstats.com/utennessee/swim/261118F012.htm"));
  assert.ok(allowed("https://static.cmumavericks.com/custompages/Swimming/LiveResults/index.htm"));
  assert.ok(!allowed("https://swimswam.com/some-article/"));
  assert.ok(!allowed("https://www.swimcloud.com/results/1"));
  assert.ok(!allowed("https://evil.com/?swimmeetresults.tech"));
  assert.ok(!allowed("https://evil.com/secret.pdf"));
  assert.ok(!allowed("http://169.254.169.254/latest/evtindex.htm"));
  assert.ok(!allowed("http://localhost/evtindex.htm"));
  assert.ok(!allowed("https://example.com:8080/evtindex.htm"));
  assert.ok(!allowed("file:///etc/passwd"));
  assert.ok(!allowed("no es una url"));
});
