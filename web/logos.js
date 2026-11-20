// Escudos de universidades (catálogo público de equipos de ESPN) y logos de organismos (Wikipedia).

const ALIASES = {
  asu: "arizona state", "arizona st": "arizona state", fsu: "florida state", "florida st": "florida state",
  osu: "ohio state", "ohio st": "ohio state", vt: "virginia tech", gt: "georgia tech", unc: "north carolina",
  "southern california": "usc", "u.s. navy": "navy", "us navy": "navy", "miami (fl)": "miami", "miami fl": "miami",
  "miami (oh)": "miami (oh)", "miami oh": "miami (oh)", "miami ohio": "miami (oh)", "iu indianapolis": "iu indy",
  iupui: "iu indy", csub: "cal state bakersfield", cal: "california", "penn st": "penn state", tamu: "texas a&m",
  pitt: "pittsburgh", uk: "kentucky", ut: "texas", wvu: "west virginia", ucsd: "uc san diego",
  ucsb: "uc santa barbara", fgcu: "florida gulf coast", fau: "florida atlantic", liu: "long island university",
  siu: "southern illinois", wku: "western kentucky", mizzou: "missouri", "mich st": "michigan state",
  "iowa st": "iowa state", "kansas st": "kansas state", "oregon st": "oregon state", "wash st": "washington state",
  "boise st": "boise state", "san diego st": "san diego state", "fresno st": "fresno state",
  "colorado st": "colorado state", "utah st": "utah state", "ga tech": "georgia tech", "va tech": "virginia tech",
  "nc st": "nc state", "n.c. state": "nc state", "north carolina st": "nc state", "north carolina state": "nc state",
  lsu: "lsu", smu: "smu", tcu: "tcu", byu: "byu", ucla: "ucla", usc: "usc", uva: "virginia",
  "ole miss": "ole miss", "texas a&m": "texas a&m", uconn: "uconn", unlv: "unlv", njit: "njit", umbc: "umbc", vmi: "vmi",
};

export const BRAND_PAGES = {
  ncaa: "National_Collegiate_Athletic_Association",
  usas: "USA_Swimming",
  usms: "United_States_Masters_Swimming",
};

export function norm(name) {
  let n = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  n = n.replace(/\buniversity of\b|\buniversity\b|\bcollege\b|\bthe\b/g, " ").replace(/\s+/g, " ").replace(/^[\s.,-]+|[\s.,-]+$/g, "");
  n = n.replace(/\bst\.?$/, "state");
  return n;
}

export function buildIndex(espnPayloads) {
  const index = {};
  for (const data of espnPayloads) {
    const teams = data?.sports?.[0]?.leagues?.[0]?.teams || [];
    for (const { team: t } of teams) {
      const logo = t?.logos?.[0]?.href;
      if (!logo) continue;
      const info = { logo, color: "#" + (t.color || "0b63ce"), display: t.shortDisplayName || t.location };
      for (const key of [t.abbreviation, t.shortDisplayName, t.location, t.displayName, t.name]) {
        if (key && !(norm(key) in index)) index[norm(key)] = info;
      }
    }
  }
  return index;
}

export function matchTeam(index, name) {
  if (!name) return null;
  const n = norm(name);
  const alias = ALIASES[n] ?? ALIASES[name.toLowerCase()];
  return (
    (alias && index[norm(alias)]) ||
    index[n] ||
    (n.endsWith(" state") ? index[n.replace(/ state$/, " st")] : null) ||
    index[n.replace(/\s*\(.*\)$/, "")] ||
    null
  );
}

export function initials(name) {
  const words = name.replace(/[()]/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 3).map((w) => w[0]).join("").toUpperCase();
}

export function colorFor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 42%)`;
}
