from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

FIX = Path(__file__).parent / "fixtures"
BASE = "https://swimmeetresults.tech/NCAA-Division-I-Men-2026/"
PAGES = {
    BASE + "evtindex.htm": "evtindex.htm",
    BASE + "260325F004.htm": "event_100fly.htm",
    BASE + "260325F002.htm": "event_relay.htm",
    "https://swimmeetresults.tech/": "catalog.htm",
}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("NATACION_DB", str(tmp_path / "t.db"))
    from app import fetch, hytek, main, store

    monkeypatch.setattr(store, "DB_PATH", tmp_path / "t.db")

    async def fake_get(url, ttl=60):
        if url not in PAGES:
            raise RuntimeError("404")
        return (FIX / PAGES[url]).read_text()

    monkeypatch.setattr(fetch, "get", fake_get)
    monkeypatch.setattr(hytek, "today_us", lambda: date(2026, 3, 26))
    return TestClient(main.app)


def test_home(client):
    r = client.get("/")
    assert r.status_code == 200 and "Mis campeonatos" in r.text


def test_meet_page_live(client):
    r = client.get("/campeonato", params={"url": "swimmeetresults.tech/NCAA-Division-I-Men-2026"})
    assert r.status_code == 200
    assert "En directo" in r.text and "Men 100 Fly Finals" in r.text
    assert 'http-equiv="refresh"' in r.text


def test_event_page_and_team_filter(client):
    r = client.get("/prueba", params={"url": BASE + "260325F004.htm", "meet": BASE + "evtindex.htm"})
    assert r.status_code == 200
    assert "Liendo, Josh" in r.text and "Final A" in r.text and "Clasificación por equipos" in r.text
    r = client.get("/prueba", params={"url": BASE + "260325F004.htm", "meet": BASE + "evtindex.htm", "equipo": "Texas"})
    assert "Kos, Hubert" in r.text and "Liendo, Josh" not in r.text


def test_unpublished_event(client):
    r = client.get("/prueba", params={"url": BASE + "260325F005.htm", "meet": BASE + "evtindex.htm"})
    assert r.status_code == 200 and "todavía no tiene resultados" in r.text


def test_teams_and_team(client):
    r = client.get("/campeonato/equipos", params={"url": BASE + "evtindex.htm"})
    assert r.status_code == 200 and "Florida" in r.text and "Northwestern" in r.text
    r = client.get("/campeonato/equipo", params={"url": BASE + "evtindex.htm", "equipo": "Florida"})
    assert "Liendo, Josh" in r.text and "Medley Relay" in r.text


def test_save_and_live(client):
    r = client.post("/campeonato/guardar", data={"url": BASE}, follow_redirects=False)
    assert r.status_code == 303
    assert "NCAA Division I Men" in client.get("/").text
    r = client.get("/directo")
    assert r.status_code == 200 and "NCAA Division I Men" in r.text


def test_catalog(client):
    r = client.get("/catalogo", params={"q": "big"})
    assert "Big Ten Championships - 2026" in r.text and "Junior Nationals - 2025" not in r.text
