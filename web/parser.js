// Lector de páginas HY-TEK Real Time Results (versión JavaScript de app/hytek.py).
// Funciona igual en el navegador y en Node (no usa DOMParser).

const DATE_RE = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
const SESSION_RE = /^\s*Session\s+\d+/i;
const EVENT_LINK_RE = /^\s*#\s*(\d+)\s+(.*)$/;
const TIME_RE = /^[xX*]?(\d{1,2}:)?\d{1,3}\.\d{2}[A-Za-z!#$&*@^]*$/;
const STATUS_RE = /^[xX]?(DQ|DFS|NS|SCR|DNF|DNS|NT|NP)$/i;
const YEAR_CODES = new Set(["FR", "SO", "JR", "SR", "5Y", "GR", "RS"]);
const INDIVIDUAL_RE = /^\s{0,3}(\d{1,3}|--|\*\d{1,3})\s+(\S.*?)\s{2,}(?:([A-Z0-9]{2}|\d{1,2})\s+)?(\S.*?)\s{2,}(\S.*)$/;
const RELAY_RE = /^\s{0,3}(\d{1,3}|--|\*\d{1,3})\s+(\S.*?)(?:\s+'?([A-F])'?)?\s{2,}(\S.*)$/;
const TEAM_SCORE_RE = /(\d{1,3})\.\s+(\S.*?)\s{2,}(\d+(?:\.\d+)?)/g;

const ROUNDS = [
  ["prelims", "Preliminares"],
  ["finals", "Finales"],
  ["semis", "Semifinales"],
  ["swim-off", "Desempate"],
  ["time trial", "Contrarreloj"],
];

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

function resolve(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

// Recorre el HTML devolviendo enlaces y trozos de texto en orden.
function* tokens(html) {
  const re = /<a\b[^>]*?href\s*=\s*["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>|<(br|\/h\d|\/p|p|hr|\/div|div|li|\/li|\/td|\/tr)\b[^>]*>|<[^>]*>|([^<]+)/gi;
  let m;
  while ((m = re.exec(html))) {
    if (m[1] !== undefined) {
      yield { type: "a", href: m[1], text: decode(m[2].replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim() };
    } else if (m[3] !== undefined) {
      yield { type: "break" };
    } else if (m[4] !== undefined) {
      const t = decode(m[4]);
      for (const part of t.split(/\n/)) {
        const s = part.trim();
        if (s) yield { type: "text", text: s };
      }
      if (t.includes("\n")) yield { type: "break" };
    }
  }
}

function parseDate(text) {
  const m = DATE_RE.exec(text || "");
  if (!m) return null;
  const [mo, d, y] = [+m[1], +m[2], +m[3]];
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function normalizeMeetUrl(url) {
  url = url.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  const u = new URL(url);
  const last = u.pathname.split("/").pop().toLowerCase();
  if (last === "evtindex.htm") return u.href;
  if (/\.html?$/.test(last)) return new URL("evtindex.htm", u).href;
  return u.href.replace(/\/+$/, "") + "/evtindex.htm";
}

export function roundOf(name) {
  const low = name.toLowerCase();
  for (const [k, label] of ROUNDS) if (low.includes(k)) return label;
  return "Final directa";
}

export function parseIndex(html, url) {
  const meet = { url, name: "", start: null, end: null, lastEventUrl: null, sessions: [] };
  const head = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(html);
  if (head) {
    const t = decode(head[1].replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
    if (!SESSION_RE.test(t)) meet.name = t;
  }
  if (!meet.name) {
    const title = /<title>([\s\S]*?)<\/title>/i.exec(html);
    if (title) meet.name = decode(title[1]).trim();
  }
  const top = decode(html.replace(/<[^>]*>/g, "\n")).split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 12);
  for (const line of top) {
    if (SESSION_RE.test(line)) continue;
    const all = [...line.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)].map((m) => parseDate(m[0]));
    if (all.length) {
      meet.start = all[0];
      meet.end = all[all.length - 1];
      break;
    }
  }
  let current = null;
  let pendingDay = false;
  for (const tok of tokens(html)) {
    if (tok.type === "text") {
      if (SESSION_RE.test(tok.text)) {
        current = { title: tok.text, day: "", events: [] };
        meet.sessions.push(current);
        pendingDay = true;
      } else if (pendingDay && current && DATE_RE.test(tok.text)) {
        current.day = tok.text;
        pendingDay = false;
      }
    } else if (tok.type === "a") {
      const href = resolve(tok.href, url);
      if (/lastevt/i.test(tok.href)) {
        meet.lastEventUrl = href;
        continue;
      }
      const m = EVENT_LINK_RE.exec(tok.text);
      if (!m) continue;
      if (!current) {
        current = { title: "Pruebas", day: "", events: [] };
        meet.sessions.push(current);
      }
      const name = m[2].trim();
      current.events.push({ number: +m[1], name, url: href, round: roundOf(name), relay: /relay/i.test(name) });
      pendingDay = false;
    }
  }
  if (!meet.start) {
    const days = meet.sessions.map((s) => parseDate(s.day)).filter(Boolean).sort();
    if (days.length) [meet.start, meet.end] = [days[0], days[days.length - 1]];
  }
  return meet;
}

export function uniqueEvents(meet) {
  const seen = new Map();
  for (const s of meet.sessions) for (const e of s.events) if (!seen.has(e.url)) seen.set(e.url, e);
  return [...seen.values()];
}

export function isLive(meet, today) {
  if (!meet.start) return false;
  return meet.start <= today && today <= (meet.end || meet.start);
}

function splitRest(rest) {
  const times = [];
  let points = "";
  for (const tok of rest.split(/\s+/).filter(Boolean)) {
    if (TIME_RE.test(tok) || STATUS_RE.test(tok)) times.push(tok);
    else if (/^\d+(\.\d+)?$/.test(tok) && times.length) points = tok;
  }
  return { times, points };
}

export function parseEvent(html, url, opts = {}) {
  const pre = /<pre[^>]*>([\s\S]*?)<\/pre>/i.exec(html);
  const text = decode((pre ? pre[1] : html).replace(/<[^>]*>/g, ""));
  const ev = { url, meetName: "", title: "", number: null, relay: false, records: [], results: [], scores: [] };
  // Psych sheet (aún sin nadar): solo se lee si se pide (la app la enseña como lista de inscritos).
  const psych = opts.entries && /Psych Sheet|Heat Sheet/i.test(text.slice(0, 1500));
  if (psych) ev.psych = true;
  let header = false;
  let section = "";
  let inScores = false;
  let scoreG = "";
  let last = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    const stripped = line.trim().replace(/^\*+|\*+$/g, "").trim();
    if (!stripped) continue;
    if (!ev.title) {
      const m = /^Event\s+(\d+)\s+(.*)$/.exec(stripped);
      if (m) {
        ev.number = +m[1];
        ev.title = m[2].trim();
        ev.relay = /relay/i.test(ev.title);
      } else if (ev.meetName.length < 60) {
        const s = stripped.replace(/\^$/, "").trim();
        ev.meetName = ev.meetName ? `${ev.meetName} ${s}` : s;
      }
      continue;
    }
    if (stripped.startsWith("===")) {
      if (stripped.slice(3).includes("===")) section = stripped.replace(/^[=\s]+|[=\s]+$/g, "");
      continue;
    }
    if (/^[=\-]+$/.test(stripped)) continue;
    if (/Team Rankings|Team Scores/.test(stripped)) {
      inScores = true;
      scoreG = /combined/i.test(stripped) ? "C" : /women|girls|female/i.test(stripped) ? "W" : /\b(men|boys|male)\b/i.test(stripped) ? "M" : "";
      continue;
    }
    if (inScores) {
      for (const m of (line + "  ").matchAll(TEAM_SCORE_RE)) ev.scores.push({ p: +m[1], t: m[2].trim(), pts: m[3], ...(scoreG ? { g: scoreG } : {}) });
      continue;
    }
    if (!header) {
      if (/^\s*(Name|Team|School)\b/.test(line) && (/Finals|Prelims|Time|Score|Seed/.test(line) || (psych && /Age|School|Year|Team/.test(line)))) {
        header = true;
        continue;
      }
      if (stripped.includes(":")) ev.records.push(stripped);
      continue;
    }

    const indented = line.startsWith("     ");
    if (!indented) {
      const m = (ev.relay ? RELAY_RE : INDIVIDUAL_RE).exec(line);
      if (m) {
        const rest = ev.relay ? m[4] : m[5];
        const { times, points } = splitRest(rest);
        if (times.length) {
          let year = ev.relay ? "" : (m[3] || "").trim();
          let team = (ev.relay ? m[2] : m[4]).trim();
          if (year && !YEAR_CODES.has(year) && !/^\d+$/.test(year)) {
            team = `${year} ${team}`;
            year = "";
          }
          last = {
            p: m[1].replace(/^\*/, ""),
            n: ev.relay ? team : m[2].trim(),
            t: team,
            y: year,
            l: ev.relay ? m[3] || "" : "",
            times,
            m: times[times.length - 1],
            pv: times.length > 1 ? times[times.length - 2] : "",
            pts: points,
            s: section,
            sp: [],
            sw: [],
          };
          ev.results.push(last);
          continue;
        }
      }
    }
    if (!last) continue;
    if (ev.relay && /\d\)\s+\S/.test(line) && line.includes(",")) {
      const re = /\d\)\s+(?:r:[+\-\d.]+\s+)?([A-Za-z'\-. ]+,\s*[A-Za-z'\-. ]+?)(?:\s+[A-Z0-9]{2})?(?=\s{2,}|\s*\d\)|$)/g;
      for (const mm of line.matchAll(re)) last.sw.push(mm[1].trim());
      continue;
    }
    for (const tok of line.replace(/\([^)]*\)/g, " ").split(/\s+/)) if (TIME_RE.test(tok)) last.sp.push(tok);
  }
  return ev;
}

export function parseCatalog(html, url) {
  const host = new URL(url).host;
  const out = [];
  const seen = new Set();
  let year = "";
  for (const tok of tokens(html)) {
    if (tok.type === "text") {
      if (/^(19|20)\d{2}$/.test(tok.text)) year = tok.text;
      continue;
    }
    if (tok.type !== "a" || !tok.text) continue;
    const href = resolve(tok.href, url);
    let u;
    try {
      u = new URL(href);
    } catch {
      continue;
    }
    if (u.host !== host || seen.has(href)) continue;
    if (u.pathname === "/" || u.pathname === "" || /no-results/i.test(u.pathname)) continue;
    const y = /(19|20)\d{2}/.exec(tok.text);
    seen.add(href);
    out.push({ name: tok.text, url: href, year: y ? y[0] : year });
  }
  return out;
}

export function organization(name) {
  const low = name.toLowerCase();
  if (low.includes("ncaa")) return "ncaa";
  if (low.includes("usms") || low.includes("masters")) return "usms";
  if (/usa swimming|junior national|winter junior|us open|u\.s\. open|olympic trials|championship trials|national championships|pro swim series|toyota|speedo/.test(low)) return "usas";
  return "conf";
}

export function todayUS() {
  // Fecha en la hora del Pacífico, la última zona de EE. UU. continental.
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return parts;
}

const RESULTS_LINK_RE = /\/(index|evtindex|\d{6}[A-Z]\d{3}|\d*lastevt)\.htm$/i;

// Canal RSS de SwimSwam: competiciones con enlace a resultados HY-TEK.
export function parseFeed(xml) {
  const meets = new Map();
  for (const it of xml.split(/<item\b/i).slice(1)) {
    const title = decode((/<title>([\s\S]*?)<\/title>/i.exec(it)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "")).trim();
    const link = (/<link>([\s\S]*?)<\/link>/i.exec(it)?.[1] || "").trim();
    const pub = Date.parse(/<pubDate>([\s\S]*?)<\/pubDate>/i.exec(it)?.[1] || "");
    const body = decode(it);
    for (const m of body.matchAll(/href=["']([^"']+)["']/gi)) {
      let u;
      try {
        u = new URL(m[1]);
      } catch {
        continue;
      }
      if (/swimswam\.com$/i.test(u.hostname) || !RESULTS_LINK_RE.test(u.pathname)) continue;
      u.protocol = "https:";
      const url = normalizeMeetUrl(u.origin + u.pathname);
      const prev = meets.get(url);
      if (!prev || pub > prev.date) meets.set(url, { url, name: meetNameFromTitle(title), title, article: link, date: pub || 0 });
    }
  }
  return [...meets.values()].sort((a, b) => b.date - a.date);
}

export function meetNameFromTitle(title) {
  let t = title.replace(/\s+/g, " ").trim();
  if (t.includes(":")) t = t.slice(0, t.indexOf(":"));
  return t.replace(/\s*[,–-]?\s*(Day \d+|Session \d+|Night \d+).*$/i, "").trim();
}
