"""Pruebas contra la web real de resultados. Solo se ejecutan con NATACION_LIVE=1."""

import asyncio
import os

import pytest

from app import fetch, hytek

pytestmark = pytest.mark.skipif(os.environ.get("NATACION_LIVE") != "1", reason="prueba en vivo desactivada")

MEET = "https://swimmeetresults.tech/NCAA-Division-I-Men-2026"


def run(coro):
    return asyncio.run(coro)


def test_live_index():
    url = hytek.normalize_meet_url(MEET)
    html = run(fetch.get(url))
    print("\n--- evtindex.htm (inicio) ---\n" + html[:3000])
    meet = hytek.parse_index(html, url)
    print("nombre:", meet.name, "| fechas:", meet.start, meet.end, "| sesiones:", len(meet.sessions), "| pruebas:", len(meet.events))
    assert "NCAA" in meet.name
    assert meet.start is not None
    assert len(meet.sessions) >= 6
    assert len(meet.events) >= 20


def test_live_event():
    fetch.clear()
    url = hytek.normalize_meet_url(MEET)
    meet = hytek.parse_index(run(fetch.get(url)), url)
    fly = next(e for e in meet.events if "100 Fly Finals" in e.name)
    html = run(fetch.get(fly.url))
    print("\n--- prueba (inicio) ---\n" + html[:2500])
    ev = hytek.parse_event(html, fly.url)
    print("título:", ev.title, "| resultados:", len(ev.results), "| equipos:", len(ev.teams))
    for r in ev.results[:3]:
        print(r)
    assert ev.title.endswith("Butterfly")
    assert len(ev.results) >= 30
    assert ev.results[0].place == "1" and ev.results[0].team
    assert ev.team_scores


def test_live_all_events_parse():
    fetch.clear()
    url = hytek.normalize_meet_url(MEET)
    meet = hytek.parse_index(run(fetch.get(url)), url)
    pages = run(fetch.get_many([e.url for e in meet.events]))
    empty = []
    for e in meet.events:
        html = pages[e.url]
        assert isinstance(html, str), f"{e.name}: {html}"
        ev = hytek.parse_event(html, e.url)
        print(f"{e.number:>3} {e.name:<40} resultados={len(ev.results):>3} relevo={ev.is_relay} equipos={len(ev.teams)}")
        if not ev.results:
            empty.append(e.name)
    assert not empty, f"pruebas sin resultados leídos: {empty}"


def test_live_catalog():
    fetch.clear()
    html = run(fetch.get("https://swimmeetresults.tech/"))
    meets = hytek.parse_catalog(html, "https://swimmeetresults.tech/")
    for m in meets[:15]:
        print(m)
    assert any("NCAA" in m["name"] for m in meets)
    assert all("no-results" not in m["url"].lower() for m in meets)
