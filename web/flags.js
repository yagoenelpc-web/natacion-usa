// Bandera (emoji) a partir de la ciudad de origen que publica la universidad: "Madrid, Spain" → 🇪🇸, "Austin, Texas" → 🇺🇸.
const US = "alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|d\\.?c\\.?|district of columbia|puerto rico|usa|u\\.s\\.a?\\.?|united states|ala|ariz|ark|calif|colo|conn|del|fla|ga|ill|ind|kan|kans|ky|la|md|mass|mich|minn|miss|mo|mont|neb|nev|n\\.?h|n\\.?j|n\\.?m|n\\.?y|n\\.?c|n\\.?d|okla|ore|pa|r\\.?i|s\\.?c|s\\.?d|tenn|tex|vt|va|wash|w\\.?va|wis|wyo|al|ak|az|ar|ca|co|ct|de|fl|hi|id|il|in|ia|ks|me|mi|mn|ms|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|ri|sc|sd|tn|tx|ut|wa|wv|wi|wy";
const US_RE = new RegExp(`^(${US})\\.?$`, "i");
const C = {
  spain: "ES", españa: "ES", canada: "CA", mexico: "MX", méxico: "MX", brazil: "BR", argentina: "AR", chile: "CL", colombia: "CO", peru: "PE", venezuela: "VE", ecuador: "EC", uruguay: "UY", paraguay: "PY", "puerto rico": "PR",
  "costa rica": "CR", panama: "PA", guatemala: "GT", honduras: "HN", "el salvador": "SV", "dominican republic": "DO", jamaica: "JM", bahamas: "BS", "the bahamas": "BS", barbados: "BB", trinidad: "TT", "trinidad and tobago": "TT", bermuda: "BM", aruba: "AW", "cayman islands": "KY", "u.s. virgin islands": "VI",
  "united kingdom": "GB", uk: "GB", england: "GB", scotland: "GB", wales: "GB", "northern ireland": "GB", "great britain": "GB", ireland: "IE", france: "FR", germany: "DE", italy: "IT", portugal: "PT", netherlands: "NL", "the netherlands": "NL", belgium: "BE", switzerland: "CH", austria: "AT",
  sweden: "SE", norway: "NO", denmark: "DK", finland: "FI", iceland: "IS", poland: "PL", "czech republic": "CZ", czechia: "CZ", slovakia: "SK", hungary: "HU", romania: "RO", bulgaria: "BG", greece: "GR", turkey: "TR", türkiye: "TR", croatia: "HR", serbia: "RS", slovenia: "SI",
  "bosnia and herzegovina": "BA", montenegro: "ME", "north macedonia": "MK", albania: "AL", estonia: "EE", latvia: "LV", lithuania: "LT", ukraine: "UA", belarus: "BY", russia: "RU", moldova: "MD", georgia_country: "GE", armenia: "AM", azerbaijan: "AZ", cyprus: "CY", malta: "MT", luxembourg: "LU", monaco: "MC", andorra: "AD", liechtenstein: "LI",
  israel: "IL", egypt: "EG", "south africa": "ZA", nigeria: "NG", kenya: "KE", ghana: "GH", morocco: "MA", tunisia: "TN", algeria: "DZ", zimbabwe: "ZW", zambia: "ZM", uganda: "UG", ethiopia: "ET", botswana: "BW", namibia: "NA", mauritius: "MU", senegal: "SN",
  australia: "AU", "new zealand": "NZ", fiji: "FJ", samoa: "WS", guam: "GU", japan: "JP", china: "CN", "hong kong": "HK", taiwan: "TW", korea: "KR", "south korea": "KR", "republic of korea": "KR", singapore: "SG", malaysia: "MY", thailand: "TH", vietnam: "VN", philippines: "PH", indonesia: "ID", india: "IN", pakistan: "PK", "sri lanka": "LK", nepal: "NP", bangladesh: "BD",
  ontario: "CA", quebec: "CA", québec: "CA", "british columbia": "CA", "b.c": "CA", alberta: "CA", manitoba: "CA", saskatchewan: "CA", "nova scotia": "CA", "new brunswick": "CA", newfoundland: "CA", queensland: "AU", "new south wales": "AU", "western australia": "AU", "south australia": "AU", tasmania: "AU",
  "united arab emirates": "AE", uae: "AE", "saudi arabia": "SA", qatar: "QA", kuwait: "KW", bahrain: "BH", oman: "OM", jordan: "JO", lebanon: "LB", iran: "IR", iraq: "IQ", kazakhstan: "KZ", uzbekistan: "UZ", mongolia: "MN",
};
const emoji = (cc) => String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0)));
// Devuelve { cc, emoji, name } o null.
export function flagOf(hometown) {
  if (!hometown) return null;
  const parts = hometown.replace(/\(.*?\)/g, " ").split(/[,/]| - /).map((x) => x.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i].toLowerCase().replace(/\.$/, "");
    if (C[p]) return { cc: C[p], emoji: emoji(C[p]), name: parts[i] };
    if (US_RE.test(parts[i]) && !(p === "georgia" && parts.length > 2)) return { cc: "US", emoji: emoji("US"), name: "USA" };
  }
  return null;
}
