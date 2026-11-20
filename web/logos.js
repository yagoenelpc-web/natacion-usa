// Escudos de universidades (catálogo público de equipos de ESPN) y logos de organismos (Wikipedia).

const ALIASES = {
  asu: "arizona state", "arizona st": "arizona state", fsu: "florida state", "florida st": "florida state",
  osu: "ohio state", "ohio st": "ohio state", vt: "virginia tech", gt: "georgia tech", unc: "north carolina",
  "southern california": "usc", "u.s. navy": "navy", "us navy": "navy", "miami (fl)": "miami", "miami fl": "miami",
  "miami (oh)": "miami (oh)", "miami oh": "miami (oh)", "miami ohio": "miami (oh)", "miami (ohio)": "miami (oh)", "noth carolina": "north carolina", "brigham young": "byu",
  "cal baptist": "california baptist", "cbu": "california baptist", "csun": "cal state northridge", "lmu": "loyola marymount", "iu indianapolis": "iu indy",
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
  // Patrocinadores que dan nombre a la competición (TYR Pro Swim Series, Toyota US Open, Speedo Junior Nationals…).
  tyr: "TYR_Sport", arena: "Arena_(swimwear)", p66: "Phillips_66",
  toyota: "https://commons.wikimedia.org/wiki/Special:FilePath/Toyota_carlogo.svg?width=200",
  // Conferencias: su logo para los campeonatos de conferencia.
  bigten: "Big_Ten_Conference", sec: "Southeastern_Conference", acc: "Atlantic_Coast_Conference", big12: "Big_12_Conference",
  bigeast: "Big_East_Conference", ivy: "Ivy_League", pac12: "Pac-12_Conference", mw: "Mountain_West_Conference",
  aac: "American_Athletic_Conference", a10: "Atlantic_10_Conference", caa: "Coastal_Athletic_Association", horizon: "Horizon_League",
  mac: "Mid-American_Conference", mvc: "Missouri_Valley_Conference", patriot: "Patriot_League", sunbelt: "Sun_Belt_Conference",
  summit: "Summit_League", bigwest: "Big_West_Conference", wac: "Western_Athletic_Conference", ccsa: "Coastal_Collegiate_Sports_Association",
  asun: "ASUN_Conference", nec: "Northeast_Conference", maac: "Metro_Atlantic_Athletic_Conference", socon: "Southern_Conference",
  cusa: "Conference_USA", bigsky: "Big_Sky_Conference", nescac: "New_England_Small_College_Athletic_Conference", uaa: "University_Athletic_Association",
  gliac: "Great_Lakes_Intercollegiate_Athletic_Conference", glvc: "Great_Lakes_Valley_Conference", ssc: "Sunshine_State_Conference", psac: "Pennsylvania_State_Athletic_Conference",
  ncac: "North_Coast_Athletic_Conference", ccac: "College_Conference_of_Illinois_and_Wisconsin", liberty: "Liberty_League", cc: "Centennial_Conference",
  bluegrass: "Bluegrass_Mountain_Conference", mpsf: "Mountain_Pacific_Sports_Federation", naia: "National_Association_of_Intercollegiate_Athletics",
};
// Nombre en la competición → logo de su conferencia.
export const SPONSOR_WORDS = [[/\btyr\b/i, "tyr"], [/toyota/i, "toyota"], [/\barena\b(?! (invite|invitational))/i, "arena"], [/phillips 66/i, "p66"]];
export const CONF_WORDS = [
  [/big ten|big 10\b/i, "bigten"], [/\bsec\b|southeastern conf/i, "sec"], [/\bacc\b|atlantic coast/i, "acc"], [/big 12/i, "big12"],
  [/big east/i, "bigeast"], [/\bivy\b/i, "ivy"], [/pac-?12/i, "pac12"], [/mountain west|\bmw\b/i, "mw"], [/\baac\b|american athletic/i, "aac"],
  [/atlantic 10|\ba-?10\b/i, "a10"], [/\bcaa\b|coastal athletic|colonial athletic/i, "caa"], [/horizon league/i, "horizon"], [/\bmac\b|mid-american/i, "mac"],
  [/\bmvc\b|missouri valley/i, "mvc"], [/patriot league/i, "patriot"], [/sun belt/i, "sunbelt"], [/summit league/i, "summit"], [/big west/i, "bigwest"],
  [/\bwac\b|western athletic/i, "wac"], [/\bccsa\b|coastal collegiate/i, "ccsa"], [/\basun\b/i, "asun"], [/\bnec\b|northeast conf/i, "nec"],
  [/\bmaac\b|metro atlantic/i, "maac"], [/southern conf|\bsocon\b/i, "socon"], [/conference usa|\bc-?usa\b/i, "cusa"], [/big sky/i, "bigsky"],
  [/nescac/i, "nescac"], [/\buaa\b|university athletic assoc/i, "uaa"], [/gliac/i, "gliac"], [/glvc/i, "glvc"], [/sunshine state|\bssc\b/i, "ssc"],
  [/psac/i, "psac"], [/\bncac\b|north coast athletic/i, "ncac"], [/\bcciw\b/i, "ccac"], [/liberty league/i, "liberty"], [/centennial conf/i, "cc"],
  [/bluegrass mountain/i, "bluegrass"], [/\bmpsf\b/i, "mpsf"], [/\bnaia\b/i, "naia"],
];

export function norm(name) {
  let n = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  // Nombres de HY-TEK: "Iona University-MR", "Lafayette Swimming and Diving", "Rider Swim & Dive".
  n = n.replace(/-[a-z]{2}$/, "").replace(/\b(men'?s|women'?s)\b/g, " ").replace(/\b(swimming|swim)\s*(and|&|\/)?\s*(diving|dive)\b|\bswim(ming)? team\b|\baquatics\b|\bswimming\b|\bathletics\b/g, " ").trim();
  n = n.replace(/\buniversity of\b|\buniversity\b|\bcollege\b|\bthe\b/g, " ").replace(/\s+/g, " ").replace(/^[\s.,-]+|[\s.,-]+$/g, "");
  n = n.replace(/\bst\.?$/, "state");
  return n;
}

export function buildIndex(espnPayloads) {
  const index = {};
  for (const data of espnPayloads) {
    const teams = data?.sports?.[0]?.leagues?.[0]?.teams || [];
    for (const { team: t } of teams) {
      if (!t || !(t.location || t.shortDisplayName)) continue;
      const logo = t.logos?.[0]?.href || "";
      const info = { logo, color: "#" + (t.color || "0b63ce"), display: t.location || t.shortDisplayName };
      for (const key of [t.location, t.shortDisplayName, t.displayName, t.abbreviation]) {
        if (!key) continue;
        const k = norm(key);
        // Un equipo con escudo gana a otro sin escudo con el mismo nombre.
        if (!(k in index) || (!index[k].logo && logo)) index[k] = info;
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
    (!/^miami \(/.test(n) ? index[n.replace(/\s*\(.*\)$/, "")] : null) ||
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
