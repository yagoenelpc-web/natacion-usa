// Descarga escudos de clubes (Wikipedia/Wikidata o web del club) y fotos libres de
// nadadores adultos (Wikidata P18, Wikimedia Commons). Escribe copa/media.js.
import fs from 'node:fs';
import vm from 'node:vm';
const ROOT = new URL('..', import.meta.url).pathname;
const UA = 'CopaDHSimulador/1.0 (app personal; contacto via GitHub)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, opt = {}) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, ...(opt.headers || {}) }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
      if (r.status === 429) { await sleep(3000 * (i + 1)); continue; }
      return r;
    } catch (e) { await sleep(1000); }
  }
  return null;
}
const json = async u => { const r = await get(u); return r && r.ok ? r.json() : null; };
const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(ROOT + 'data.js', 'utf8'), ctx);
const D = ctx.window.COPA_DATA;
const CFG = JSON.parse(fs.readFileSync(ROOT + 'herramientas/clubes-web.json', 'utf8'));
fs.mkdirSync(ROOT + 'escudos', { recursive: true });
fs.mkdirSync(ROOT + 'fotos', { recursive: true });
const OUT = fs.existsSync(ROOT + 'media.json') ? JSON.parse(fs.readFileSync(ROOT + 'media.json', 'utf8')) : { escudos: {}, fotos: {} };
const ONLY = (process.env.SOLO || '').split(',').filter(Boolean);

async function wdEntityFromWiki(title, lang) {
  const j = await json(`https://${lang}.wikipedia.org/w/api.php?action=query&prop=pageprops|pageimages&piprop=original&format=json&redirects=1&titles=${encodeURIComponent(title)}`);
  const p = j && Object.values(j.query.pages)[0];
  if (!p || p.missing !== undefined) return null;
  return { qid: p.pageprops && p.pageprops.wikibase_item, img: p.original && p.original.source, title: p.title };
}
async function wdClaims(qid) {
  const j = await json(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
  return j && j.entities[qid] ? j.entities[qid].claims : {};
}
const commons = (f, w) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(f)}${w ? '?width=' + w : ''}`;
async function save(url, base) {
  const r = await get(url); if (!r || !r.ok) return null;
  const ct = r.headers.get('content-type') || '';
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 400) return null;
  const ext = ct.includes('svg') ? 'svg' : ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : ct.includes('jpeg') || ct.includes('jpg') ? 'jpg' : ct.includes('gif') ? 'gif' : (url.match(/\.(png|jpe?g|svg|webp|gif)(\?|$)/i) || [])[1];
  if (!ext || ct.includes('html')) return null;
  const file = `${base}.${ext.replace('jpeg', 'jpg')}`;
  for (const e of ['png', 'jpg', 'svg', 'webp', 'gif']) { const old = `${base}.${e}`; if (old !== file && fs.existsSync(ROOT + old)) fs.unlinkSync(ROOT + old); }
  fs.writeFileSync(ROOT + file, buf);
  return file;
}
function absUrl(u, base) { try { return new URL(u.replace(/&amp;/g, '&'), base).href; } catch { return null; } }
async function logoFromSite(site) {
  const r = await get(site); if (!r || !r.ok) return [];
  const html = await r.text(); const base = r.url; const c = [];
  for (const m of html.matchAll(/<img[^>]+>/gi)) {
    const tag = m[0]; const src = (tag.match(/\s(?:data-src|src)=["']([^"']+)["']/i) || [])[1];
    if (src && /logo|escudo|escut|header|brand/i.test(tag) && !/sponsor|patroc|footer|partner|ajuntament|ayuntamiento|diputaci|generalitat/i.test(tag)) c.push(absUrl(src, base));
  }
  for (const m of html.matchAll(/<link[^>]+rel=["'](?:apple-touch-icon|icon)[^>]*>/gi)) { const h = (m[0].match(/href=["']([^"']+)["']/i) || [])[1]; if (h && /(180|192|512|apple)/.test(m[0])) c.push(absUrl(h, base)); }
  const og = (html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i) || [])[1]; if (og) c.push(absUrl(og, base));
  return c.filter(Boolean);
}
async function escudos() {
  for (const club of D.clubs) {
    if (ONLY.length && !ONLY.includes(club.id)) continue;
    const cfg = CFG[club.id] || {}; const tries = [];
    for (const [lang, title] of (cfg.wiki || [])) {
      const e = await wdEntityFromWiki(title, lang); if (!e) continue;
      if (e.qid) { const cl = await wdClaims(e.qid); const logo = cl.P154 && cl.P154[0].mainsnak.datavalue?.value; if (logo) tries.push(['wikidata', commons(logo, 400), 'Wikimedia Commons']);
        const web = cl.P856 && cl.P856[0].mainsnak.datavalue?.value; if (web && !cfg.web) cfg.web = web; }
      if (e.img) tries.push(['wikipedia', e.img, 'Wikipedia']);
      await sleep(300);
    }
    if (cfg.logo) tries.unshift(['manual', cfg.logo, cfg.web || 'web del club']);
    if (cfg.web) for (const u of await logoFromSite(cfg.web)) tries.push(['web', u, cfg.web]);
    let ok = null;
    for (const [src, url, credit] of tries) { const f = await save(url, 'escudos/' + club.id); if (f) { ok = { f, src, url, credit }; break; } }
    if (ok) OUT.escudos[club.id] = ok;
    console.log('@@ESCUDO', club.id, ok ? ok.src + ' ' + ok.url : 'NINGUNO', '| candidatos:', tries.length, cfg.web || '');
  }
}
function norm(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim(); }
async function fotos() {
  const adults = D.swimmers.filter(s => s.y && s.y <= 2007);
  let n = 0;
  for (const s of adults) {
    if (OUT.fotos[s.id] && !process.env.REHACER) continue;
    const parts = s.n.split(' ');
    const queries = [s.n, parts.slice(0, -1).join(' ')].filter((q, i, a) => q.split(' ').length >= 2 && a.indexOf(q) === i);
    let found = null;
    for (const q of queries) {
      const j = await json(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=es&type=item&limit=5&search=${encodeURIComponent(q)}`);
      await sleep(150);
      for (const it of (j && j.search) || []) {
        const cl = await wdClaims(it.id); await sleep(100);
        const occ = (cl.P106 || []).map(x => x.mainsnak.datavalue?.value.id);
        if (!occ.includes('Q10843402')) continue; // nadador
        const born = cl.P569 && cl.P569[0].mainsnak.datavalue?.value.time; const by = born ? +born.slice(1, 5) : null;
        if (by && Math.abs(by - s.y) > 1) continue;
        const nat = (cl.P27 || []).map(x => x.mainsnak.datavalue?.value.id);
        const label = norm(it.label || ''); const nn = norm(s.n);
        const fam = nn.split(' ').slice(1);
        if (!fam.some(w => w.length > 2 && label.includes(w))) continue;
        if (!by && !nat.includes('Q29')) continue;
        const img = cl.P18 && cl.P18[0].mainsnak.datavalue?.value;
        found = { qid: it.id, img, label: it.label };
        break;
      }
      if (found) break;
    }
    if (found && found.img) {
      const f = await save(commons(found.img, 360), 'fotos/' + s.id);
      if (f) { OUT.fotos[s.id] = { f, qid: found.qid, file: found.img }; n++; }
    }
    console.log('@@FOTO', s.id, s.n, s.y, found ? `${found.qid} ${found.label} ${found.img || 'sin imagen'}` : '-');
  }
  console.log('Fotos nuevas', n, 'de', adults.length, 'adultos');
}
if (!process.env.SOLO_FOTOS) await escudos();
if (!process.env.SOLO_ESCUDOS) await fotos();
fs.writeFileSync(ROOT + 'media.json', JSON.stringify(OUT, null, 1));
fs.writeFileSync(ROOT + 'media.js', 'window.COPA_MEDIA=' + JSON.stringify(OUT) + ';\n');
