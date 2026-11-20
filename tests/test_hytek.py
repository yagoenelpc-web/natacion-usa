from datetime import date
from pathlib import Path

from app.hytek import normalize_meet_url, parse_catalog, parse_event, parse_index

FIX = Path(__file__).parent / "fixtures"
BASE = "https://swimmeetresults.tech/NCAA-Division-I-Men-2026/"


def read(name):
    return (FIX / name).read_text()


def test_normalize_meet_url():
    assert normalize_meet_url("swimmeetresults.tech/NCAA-Division-I-Men-2026") == BASE + "evtindex.htm"
    assert normalize_meet_url(BASE + "index.htm") == BASE + "evtindex.htm"
    assert normalize_meet_url(BASE + "evtindex.htm") == BASE + "evtindex.htm"


def test_parse_index():
    m = parse_index(read("evtindex.htm"), BASE + "evtindex.htm")
    assert "NCAA Division I Men" in m.name
    assert (m.start, m.end) == (date(2026, 3, 25), date(2026, 3, 28))
    assert m.last_event_url == BASE + "260325lastevt.htm"
    assert [s.title for s in m.sessions] == ["Session 1 - 10:00 AM", "Session 3 - 10:00 AM", "Session 4 - 6:03 PM"]
    assert m.sessions[0].day == "Wednesday 3/25/2026"
    fly = m.sessions[2].events[0]
    assert (fly.number, fly.name, fly.round) == (4, "Men 100 Fly Finals", "Finales")
    assert fly.url == BASE + "260325F004.htm"
    assert m.sessions[0].events[1].is_relay
    assert len(m.events) == 7
    assert m.is_live(date(2026, 3, 26)) and not m.is_live(date(2026, 4, 1))


def test_parse_individual_event():
    ev = parse_event(read("event_100fly.htm"), BASE + "260325F004.htm")
    assert ev.number == 4 and ev.title == "Men 100 Yard Butterfly"
    assert "NCAA Division I" in ev.meet_name
    assert any(r.startswith("NCAA:") for r in ev.records)
    first = ev.results[0]
    assert (first.place, first.name, first.year, first.team) == ("1", "Liendo, Josh", "SR", "Florida")
    assert first.times == ["42.54", "42.49N"] and first.points == "20"
    assert first.section == "Championship Final"
    assert first.splits == ["9.02", "19.84", "31.05", "42.49"]
    hayes = ev.results[2]
    assert (hayes.year, hayes.team) == ("5Y", "NC State")
    finch = ev.results[3]
    assert finch.section == "Preliminaries" and finch.mark == "44.19" and finch.points == "9"
    assert ev.results[4].team == "IU Indianapolis"
    assert ev.results[5].name == "Arkhangelskiy, Michel"
    dfs = ev.results[-1]
    assert (dfs.place, dfs.team, dfs.mark) == ("--", "ASU", "DFS")
    assert ev.team_scores[:2] == [(1, "Florida", "119"), (2, "Texas", "90")]
    assert ev.team_scores[-1] == (27, "Northwestern", "2")
    assert "Florida" in ev.teams and len(ev.results) == 7


def test_parse_relay_event():
    ev = parse_event(read("event_relay.htm"), BASE + "260325F002.htm")
    assert ev.is_relay
    r = ev.results[0]
    assert (r.team, r.relay_letter, r.times, r.points) == ("Florida", "A", ["1:21.20", "1:20.15"], "40")
    assert r.swimmers == ["Smith, John", "Doe, Jim", "Liendo, Josh", "Chaney, Adam"]
    assert ev.results[2].mark == "DQ"
    assert len(ev.results) == 3


def test_parse_catalog():
    meets = parse_catalog(read("catalog.htm"), "https://swimmeetresults.tech/")
    assert [m["name"] for m in meets] == [
        "NCAA Division I Men - 2026",
        "Big Ten Championships - 2026",
        "USA Swimming Junior Nationals - 2025",
    ]
    assert meets[0]["year"] == "2026"
    assert meets[0]["url"] == "https://swimmeetresults.tech/NCAA-Division-I-Men-2026"
