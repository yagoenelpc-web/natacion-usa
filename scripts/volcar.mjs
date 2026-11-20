// Herramienta de desarrollo: muestra el texto de unas páginas.
const urls = (process.env.URLS || "").split(/\s+/).filter(Boolean);
for (const u of urls) {
  try {
    const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (results app)" }, signal: AbortSignal.timeout(20000) });
    if (process.env.GREP === "B64") { console.log("@@B64", u.slice(-60), Buffer.from(await r.arrayBuffer()).toString("base64")); continue; }
    const t = await r.text();
    console.log("@@URL", u, r.status, t.length, "→", r.url);
    if (process.env.GREP === "MARCAS") {
      const marks = ["s-person-details__root", "roster-card-item", '"@type":"Person"', "sidearm-roster-player", "View Profile", "roster__list", "player-card", "roster-list", "__NUXT", "__NEXT_DATA__", "s-person-card", "rosterTable", "roster_table", "table"];
      console.log(marks.map((m) => m + "=" + (t.split(m).length - 1)).join("  ") + "  | " + (/<title>([^<]*)/.exec(t)?.[1] || "").trim());
      console.log("@@FIN");
      continue;
    }
    if (process.env.GREP) {
      const re = new RegExp(process.env.GREP, "gi");
      let k = 0;
      for (const m of t.matchAll(re)) { if (k++ > 6) break; console.log("…" + t.slice(Math.max(0, m.index - 500), m.index + 700).replace(/\s+/g, " ")); }
    } else console.log(t.slice(0, Number(process.env.MAX || 2500)).replace(/\r/g, ""));
    console.log("@@FIN");
  } catch (e) { console.log("@@URL", u, "ERROR", e.message); }
}
