"""Lector de páginas HY-TEK Real Time Results.

HY-TEK Meet Manager publica cada campeonato como un índice (evtindex.htm) con
enlaces a una página por prueba. Cada prueba es texto de ancho fijo dentro de
un <pre>. Este módulo convierte ambas cosas en estructuras de Python.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup, NavigableString, Tag

DATE_RE = re.compile(r"(\d{1,2})/(\d{1,2})/(\d{4})")
SESSION_RE = re.compile(r"^\s*Session\s+\d+", re.I)
EVENT_LINK_RE = re.compile(r"^\s*#\s*(\d+)\s+(.*)$")
ROUND_WORDS = {
    "prelims": "Preliminares",
    "finals": "Finales",
    "semis": "Semifinales",
    "swim-off": "Desempate",
    "time trial": "Contrarreloj",
}

# Una marca: 1:22.34, 42.49, 412.35 (saltos), con prefijo X o sufijo de récord.
TIME_RE = re.compile(r"^[xX*]?(\d{1,2}:)?\d{1,2}\.\d{2}[A-Za-z!#$&*@^]*$")
STATUS_RE = re.compile(r"^[xX]?(DQ|DFS|NS|SCR|DNF|DNS|NT|NP)$", re.I)
YEAR_CODES = {"FR", "SO", "JR", "SR", "5Y", "GR", "RS"}

INDIVIDUAL_RE = re.compile(
    r"^\s{0,3}(?P<place>\d{1,3}|--|\*\d{1,3})\s+"
    r"(?P<name>\S.*?,.*?)\s{2,}"
    r"(?:(?P<year>[A-Z0-9]{2}|\d{1,2})\s+)?"
    r"(?P<team>\S.*?)\s{2,}"
    r"(?P<rest>\S.*)$"
)
RELAY_RE = re.compile(
    r"^\s{0,3}(?P<place>\d{1,3}|--|\*\d{1,3})\s+"
    r"(?P<team>\S.*?)"
    r"(?:\s+'?(?P<letter>[A-F])'?)?\s{2,}"
    r"(?P<rest>\S.*)$"
)
TEAM_SCORE_RE = re.compile(r"(\d{1,3})\.\s+(\S.*?)\s{2,}(\d+(?:\.\d+)?)")


@dataclass
class EventLink:
    number: int
    name: str
    url: str

    @property
    def round(self) -> str:
        low = self.name.lower()
        for key, label in ROUND_WORDS.items():
            if key in low:
                return label
        return "Final directa"

    @property
    def is_relay(self) -> bool:
        return "relay" in self.name.lower()


@dataclass
class SessionInfo:
    title: str
    day: str = ""
    events: list[EventLink] = field(default_factory=list)


@dataclass
class MeetIndex:
    url: str
    name: str
    start: date | None = None
    end: date | None = None
    last_event_url: str | None = None
    sessions: list[SessionInfo] = field(default_factory=list)

    @property
    def events(self) -> list[EventLink]:
        seen: dict[str, EventLink] = {}
        for s in self.sessions:
            for e in s.events:
                seen.setdefault(e.url, e)
        return list(seen.values())

    def is_live(self, today: date) -> bool:
        if not self.start:
            return False
        end = self.end or self.start
        return self.start <= today <= end


@dataclass
class Result:
    place: str
    name: str
    team: str
    year: str = ""
    relay_letter: str = ""
    times: list[str] = field(default_factory=list)
    points: str = ""
    section: str = ""
    splits: list[str] = field(default_factory=list)
    swimmers: list[str] = field(default_factory=list)

    @property
    def mark(self) -> str:
        """La marca que cuenta en esta fila (la última columna de tiempo)."""
        return self.times[-1] if self.times else ""

    @property
    def previous(self) -> str:
        return self.times[-2] if len(self.times) > 1 else ""


@dataclass
class EventResults:
    url: str
    meet_name: str = ""
    title: str = ""
    number: int | None = None
    is_relay: bool = False
    records: list[str] = field(default_factory=list)
    columns: list[str] = field(default_factory=list)
    results: list[Result] = field(default_factory=list)
    team_scores: list[tuple[int, str, str]] = field(default_factory=list)

    @property
    def teams(self) -> list[str]:
        return sorted({r.team for r in self.results if r.team})


def normalize_meet_url(url: str) -> str:
    """Devuelve la URL del índice de pruebas (evtindex.htm) de un campeonato."""
    url = url.strip()
    if not urlparse(url).scheme:
        url = "https://" + url
    path = urlparse(url).path
    last = path.rsplit("/", 1)[-1].lower()
    if last == "evtindex.htm":
        return url
    if last.endswith((".htm", ".html")):
        return urljoin(url, "evtindex.htm")
    return url.rstrip("/") + "/evtindex.htm"


def _parse_date(text: str) -> date | None:
    m = DATE_RE.search(text)
    if not m:
        return None
    month, day, year = (int(x) for x in m.groups())
    try:
        return date(year, month, day)
    except ValueError:
        return None


def parse_index(html: str, url: str) -> MeetIndex:
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text("\n")
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

    name = ""
    for tag in soup.find_all(["h1", "h2", "h3", "b", "strong", "font"]):
        t = tag.get_text(" ", strip=True)
        if t and not SESSION_RE.match(t) and not t.startswith("#") and len(t) > 6:
            name = t
            break
    if not name and soup.title:
        name = soup.title.get_text(strip=True)
    if not name and lines:
        name = lines[0]

    start = end = None
    for ln in lines[:12]:
        dates = DATE_RE.findall(ln)
        if dates and not SESSION_RE.match(ln):
            parsed = [_parse_date("/".join(d)) for d in dates]
            parsed = [d for d in parsed if d]
            if parsed:
                start, end = parsed[0], parsed[-1]
                break

    meet = MeetIndex(url=url, name=name, start=start, end=end)
    current: SessionInfo | None = None
    pending_day = False

    for node in soup.descendants:
        if isinstance(node, NavigableString):
            if node.parent is not None and node.parent.name == "a":
                continue
            t = str(node).strip()
            if not t:
                continue
            if SESSION_RE.match(t):
                current = SessionInfo(title=t)
                meet.sessions.append(current)
                pending_day = True
            elif pending_day and current is not None and DATE_RE.search(t):
                current.day = t
                pending_day = False
            continue
        if isinstance(node, Tag) and node.name == "a" and node.get("href"):
            label = node.get_text(" ", strip=True)
            href = urljoin(url, node["href"])
            if "lastevt" in node["href"].lower():
                meet.last_event_url = href
                continue
            m = EVENT_LINK_RE.match(label)
            if not m:
                continue
            if current is None:
                current = SessionInfo(title="Pruebas")
                meet.sessions.append(current)
            current.events.append(EventLink(int(m.group(1)), m.group(2).strip(), href))
            pending_day = False

    if not meet.start:
        days = [_parse_date(s.day) for s in meet.sessions if s.day]
        days = [d for d in days if d]
        if days:
            meet.start, meet.end = min(days), max(days)
    return meet


def _split_rest(rest: str) -> tuple[list[str], str]:
    times: list[str] = []
    points = ""
    for tok in rest.split():
        if TIME_RE.match(tok) or STATUS_RE.match(tok):
            times.append(tok)
        elif re.fullmatch(r"\d+(\.\d+)?", tok) and times:
            points = tok
    return times, points


def parse_event(html: str, url: str) -> EventResults:
    soup = BeautifulSoup(html, "html.parser")
    pre = soup.find("pre")
    text = pre.get_text() if pre else soup.get_text("\n")
    lines = text.splitlines()

    ev = EventResults(url=url)
    header_seen = False
    section = ""
    in_scores = False
    last: Result | None = None

    for raw in lines:
        line = raw.rstrip()
        stripped = line.strip().strip("*").strip()
        if not stripped:
            continue
        if not ev.title:
            m = re.match(r"^Event\s+(\d+)\s+(.*)$", stripped)
            if m:
                ev.number = int(m.group(1))
                ev.title = m.group(2).strip()
                ev.is_relay = "relay" in ev.title.lower()
                continue
            if not ev.meet_name or len(ev.meet_name) < 60:
                stripped = stripped.rstrip("^").strip()
                ev.meet_name = (ev.meet_name + " " + stripped).strip() if ev.meet_name else stripped
            continue
        if stripped.startswith("==="):
            if "===" in stripped[3:]:
                section = stripped.strip("= ").strip()
            continue
        if set(stripped) <= {"=", "-"}:
            continue
        if "Team Rankings" in stripped or "Team Scores" in stripped:
            in_scores = True
            continue
        if in_scores:
            for place, team, pts in TEAM_SCORE_RE.findall(line + "  "):
                ev.team_scores.append((int(place), team.strip(), pts))
            continue
        if not header_seen:
            if re.match(r"^\s*(Name|Team|School)\b", line) and ("Finals" in line or "Prelims" in line or "Time" in line or "Score" in line or "Seed" in line):
                header_seen = True
                ev.columns = line.split()
                continue
            if ":" in stripped:
                ev.records.append(stripped)
            continue

        m = (RELAY_RE if ev.is_relay else INDIVIDUAL_RE).match(line)
        if m and not line.startswith("     "):
            times, points = _split_rest(m.group("rest"))
            if not times:
                m = None
        if m and not line.startswith("     "):
            year = (m.groupdict().get("year") or "").strip()
            team = m.group("team").strip()
            if year and year not in YEAR_CODES and not year.isdigit():
                team = f"{year} {team}"
                year = ""
            last = Result(
                place=m.group("place").lstrip("*"),
                name=(m.groupdict().get("name") or team).strip(),
                team=team,
                year=year,
                relay_letter=(m.groupdict().get("letter") or ""),
                times=times,
                points=points,
                section=section,
            )
            ev.results.append(last)
            continue

        if last is None:
            continue
        if ev.is_relay and re.search(r"\d\)\s+\S", line) and "," in line:
            for nm in re.findall(r"\d\)\s+(?:r:[+\-\d.]+\s+)?([A-Za-z'\-. ]+,\s*[A-Za-z'\-. ]+?)(?:\s+[A-Z0-9]{2})?(?=\s{2,}|\s*\d\)|$)", line):
                last.swimmers.append(nm.strip())
            continue
        for tok in re.sub(r"\([^)]*\)", " ", line).split():
            if TIME_RE.match(tok):
                last.splits.append(tok)
    return ev


def parse_catalog(html: str, url: str) -> list[dict]:
    """Lista de campeonatos de una portada tipo swimmeetresults.tech."""
    soup = BeautifulSoup(html, "html.parser")
    host = urlparse(url).netloc
    meets: list[dict] = []
    seen: set[str] = set()
    year = ""
    for node in soup.descendants:
        if isinstance(node, NavigableString):
            t = str(node).strip()
            if re.fullmatch(r"(19|20)\d{2}", t) and node.parent.name != "a":
                year = t
            continue
        if not (isinstance(node, Tag) and node.name == "a" and node.get("href")):
            continue
        href = urljoin(url, node["href"])
        parsed = urlparse(href)
        label = node.get_text(" ", strip=True)
        if parsed.netloc != host or not label or href in seen:
            continue
        if parsed.path in ("", "/") or href.rstrip("/") == url.rstrip("/") or "no-results" in parsed.path.lower():
            continue
        y = re.search(r"(19|20)\d{2}", label)
        seen.add(href)
        meets.append({"name": label, "url": href, "year": y.group(0) if y else year})
    return meets


def today_us() -> date:
    """Fecha actual en la hora del Pacífico, la última zona de EE. UU. continental."""
    try:
        from zoneinfo import ZoneInfo

        return datetime.now(ZoneInfo("America/Los_Angeles")).date()
    except Exception:  # pragma: no cover
        return date.today()
