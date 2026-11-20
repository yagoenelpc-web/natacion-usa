// Prueba rápida de fuentes públicas (solo para desarrollo).
const UA = { headers: { "User-Agent": "natacion-usa/0.3 (app personal)" } };
const espn = [
  "basketball/mens-college-basketball/teams?limit=2000",
  "basketball/mens-college-basketball/teams?limit=2000&groups=50",
  "football/college-football/teams?limit=2000",
  "football/college-football/teams?limit=2000&groups=81",
  "football/college-football/teams?limit=2000&groups=35",
  "football/college-football/teams?limit=2000&groups=36",
  "soccer/usa.ncaa.w.1/teams?limit=2000",
  "volleyball/womens-college-volleyball/teams?limit=2000",
  "baseball/college-baseball/teams?limit=2000",
];
for (const p of espn) {
  try {
    const d = await (await fetch("https://site.api.espn.com/apis/site/v2/sports/" + p, UA)).json();
    const t = d?.sports?.[0]?.leagues?.[0]?.teams || [];
    console.log("ESPN", p, t.length, t.slice(0, 3).map((x) => x.team.location).join("|"), "logos:", t.filter((x) => x.team.logos?.length).length);
  } catch (e) {
    console.log("ESPN", p, "ERROR", e.message);
  }
}
const feed = await (await fetch("https://swimswam.com/feed/", UA)).text();
console.log("FEED bytes", feed.length);
const items = feed.split("<item>").slice(1);
for (const it of items) {
  const title = /<title>([\s\S]*?)<\/title>/.exec(it)?.[1];
  const date = /<pubDate>(.*?)<\/pubDate>/.exec(it)?.[1];
  const links = [...it.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/swimswam\.com/.test(u));
  const hytek = links.filter((u) => /evtindex|\.htm|results|meetmobile|swimcloud/i.test(u));
  console.log("ITEM", date, "|", title, "|", [...new Set(hytek)].slice(0, 5).join(" "));
}
for (const f of ["https://swimswam.com/feed/?paged=2", "https://swimswam.com/category/live-results/feed/", "https://swimswam.com/tag/live-results/feed/"]) {
  const r = await fetch(f, UA);
  const t = await r.text();
  console.log("OTRO", f, r.status, (t.match(/<item>/g) || []).length);
}
