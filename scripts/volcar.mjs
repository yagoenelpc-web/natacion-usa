// Herramienta de desarrollo: muestra el texto de unas páginas.
const urls = (process.env.URLS || "").split(/\s+/).filter(Boolean);
for (const u of urls) {
  try {
    const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (results app)" }, signal: AbortSignal.timeout(20000) });
    const t = await r.text();
    console.log("@@URL", u, r.status, t.length);
    if (process.env.GREP) {
      const re = new RegExp(process.env.GREP, "gi");
      let k = 0;
      for (const m of t.matchAll(re)) { if (k++ > 6) break; console.log("…" + t.slice(Math.max(0, m.index - 500), m.index + 700).replace(/\s+/g, " ")); }
    } else console.log(t.slice(0, Number(process.env.MAX || 2500)).replace(/\r/g, ""));
    console.log("@@FIN");
  } catch (e) { console.log("@@URL", u, "ERROR", e.message); }
}
