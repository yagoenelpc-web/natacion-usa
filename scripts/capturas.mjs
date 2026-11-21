// Hace capturas de la app (tamaño móvil) con el servidor local en marcha.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const out = process.argv[2] || "capturas";
const base = process.env.BASE || "http://localhost:8888/";
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${decodeURIComponent(r.url()).slice(0, 160)}`));

async function shot(name, hash, wait = "main :is(.mcard,.erow,.rrow,.srow,.trow,.urow,.card,.empty)") {
  await page.goto(base + hash);
  await page.waitForSelector(wait, { timeout: 90000 }).catch(() => errors.push("sin contenido: " + name));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  return page;
}

await shot("1-portada", "#/");
const meet = await page.$$eval("a.mcard", (as) => as.map((a) => a.getAttribute("href")));
console.log("campeonatos en portada:", meet.length);
const ncaa = (await page.$$eval("a.mcard", (as) => as.map((a) => [a.getAttribute("href"), a.textContent]))).find(([, t]) => /NCAA Division I/i.test(t));
const liveHref = await page.$$eval("a.mcard.live", (as) => as.map((a) => a.getAttribute("href")));
console.log("en directo:", liveHref);
const target = liveHref[0] || (ncaa ? ncaa[0] : "#/m/NCAA-Division-I-Men-2026");
await shot("2-campeonato", target);
await shot("3-clasificacion", target + "/clasificacion");
const ev = await page.goto(base + target).then(() => page.waitForSelector("a.erow", { timeout: 60000 })).then(() => page.$$eval("a.erow", (as) => as.map((a) => a.getAttribute("href"))));
if (ev.length) {
  await shot("4-prueba", ev[Math.min(3, ev.length - 1)]);
  await shot("5-relevo", ev[1]);
}
await shot("6-universidades", "#/u");
await shot("7-ficha", "#/uni/Texas", ".rkcard");
await shot("7b-ficha-info", "#/uni/Stanford/info", ".facts");
await shot("7c-ranking", "#/rank/conf/SSC/W", ".rkrow");
await shot("8-ajustes", "#/ajustes", ".settings");
await shot("9-records", "#/rec", ".rectile");
await shot("9b-records-d3", "#/rec/D3/W", ".rectile");
await shot("9c-records-unis", "#/rec/unis", ".recunis");
await page.goto(base + "#/n");
await page.fill("#sq", process.env.NADADOR || "Gemmell");
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/9-nadadores.png`, fullPage: true });
const first = await page.$eval("#slist a.urow", (a) => a.getAttribute("href")).catch(() => null);
if (first) await shot("9b-nadador", first, ".list");
console.log("universidades en el buscador:", await page.$$eval(".urow", (r) => r.length));
console.log("errores:", errors);
if (process.env.CAPTURAS_LOG) {
  // Las capturas también van al registro, para poder verlas sin descargar artefactos.
  const { readdir, readFile } = await import("node:fs/promises");
  for (const f of (await readdir(out)).sort()) {
    const b64 = (await readFile(`${out}/${f}`)).toString("base64");
    for (let i = 0; i < b64.length; i += 3000) console.log(`@@CAPTURA ${f} ${b64.slice(i, i + 3000)}`);
  }
}
await browser.close();
