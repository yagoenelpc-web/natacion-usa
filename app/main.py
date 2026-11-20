"""App web de resultados de natación de EE. UU."""

from __future__ import annotations

import os
import re
from pathlib import Path
from urllib.parse import quote

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from . import fetch, hytek, store

BASE = Path(__file__).resolve().parent
CATALOG_SOURCES = [
    s.strip()
    for s in os.environ.get("NATACION_CATALOGOS", "https://swimmeetresults.tech/").split(",")
    if s.strip()
]

app = FastAPI(title="Natación USA")
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")
templates = Jinja2Templates(directory=BASE / "templates")
templates.env.filters["q"] = lambda s: quote(str(s), safe="")

ROUND_ES = {"Championship Final": "Final A", "Consolation Final": "Final B",
            "Bonus Final": "Final C", "Preliminaries": "Preliminares",
            "Semi-Finals": "Semifinales", "Swim-off": "Desempate"}
templates.env.filters["ronda"] = lambda s: ROUND_ES.get(s, s)


def render(request: Request, name: str, **ctx) -> HTMLResponse:
    return templates.TemplateResponse(request, name, ctx)


async def load_index(url: str) -> hytek.MeetIndex:
    url = hytek.normalize_meet_url(url)
    html = await fetch.get(url, ttl=fetch.LIVE_TTL)
    return hytek.parse_index(html, url)


def ttl_for(meet: hytek.MeetIndex) -> int:
    return fetch.LIVE_TTL if meet.is_live(hytek.today_us()) else fetch.DONE_TTL


async def load_all_events(meet: hytek.MeetIndex) -> list[hytek.EventResults]:
    pages = await fetch.get_many([e.url for e in meet.events], ttl=ttl_for(meet))
    out = []
    for e in meet.events:
        html = pages.get(e.url)
        if isinstance(html, str):
            ev = hytek.parse_event(html, e.url)
            ev.link = e  # type: ignore[attr-defined]
            out.append(ev)
    return out


async def load_catalog() -> list[dict]:
    meets: list[dict] = []
    for src in CATALOG_SOURCES:
        try:
            html = await fetch.get(src, ttl=3600)
        except Exception:
            continue
        for m in hytek.parse_catalog(html, src):
            m["source"] = src
            meets.append(m)
    return meets


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return render(
        request,
        "home.html",
        saved=store.saved_meets(),
        imported=store.imported_meets(),
    )


@app.get("/directo", response_class=HTMLResponse)
async def live(request: Request):
    today = hytek.today_us()
    years = {str(today.year), str(today.year + 1)}
    candidates = {r["url"]: r["name"] for r in store.saved_meets()}
    catalog_error = None
    try:
        for m in await load_catalog():
            if m["year"] in years:
                candidates.setdefault(m["url"], m["name"])
    except Exception as exc:  # pragma: no cover
        catalog_error = str(exc)

    live_meets, upcoming, errors = [], [], []
    for url, name in candidates.items():
        try:
            meet = await load_index(url)
        except Exception:
            errors.append(name)
            continue
        if meet.is_live(today):
            live_meets.append(meet)
        elif meet.start and meet.start > today:
            upcoming.append(meet)
    upcoming.sort(key=lambda m: m.start)
    return render(request, "live.html", live=live_meets, upcoming=upcoming, errors=errors,
                  today=today, catalog_error=catalog_error)


@app.get("/catalogo", response_class=HTMLResponse)
async def catalog(request: Request, q: str = ""):
    meets = await load_catalog()
    if q:
        meets = [m for m in meets if q.lower() in m["name"].lower()]
    by_year: dict[str, list[dict]] = {}
    for m in meets:
        by_year.setdefault(m["year"] or "Sin año", []).append(m)
    years = sorted(by_year, reverse=True)
    return render(request, "catalog.html", by_year=by_year, years=years, q=q, sources=CATALOG_SOURCES)


@app.get("/campeonato", response_class=HTMLResponse)
async def meet_page(request: Request, url: str):
    meet = await load_index(url)
    saved = any(r["url"] == meet.url for r in store.saved_meets())
    return render(request, "meet.html", meet=meet, live=meet.is_live(hytek.today_us()), saved=saved)


@app.post("/campeonato/guardar")
async def save_meet(url: str = Form(...)):
    meet = await load_index(url)
    store.save_meet(meet.url, meet.name or meet.url)
    return RedirectResponse(f"/campeonato?url={quote(meet.url, safe='')}", status_code=303)


@app.post("/campeonato/quitar")
async def remove_meet(url: str = Form(...)):
    store.remove_meet(url)
    return RedirectResponse("/", status_code=303)


@app.get("/campeonato/equipos", response_class=HTMLResponse)
async def meet_teams(request: Request, url: str):
    meet = await load_index(url)
    events = await load_all_events(meet)
    counts: dict[str, int] = {}
    for ev in events:
        for r in ev.results:
            if r.team:
                counts[r.team] = counts.get(r.team, 0) + 1
    scores: list = []
    for ev in sorted(events, key=lambda e: e.number or 0):
        if ev.team_scores:
            scores, scores_after = ev.team_scores, ev
    return render(request, "teams.html", meet=meet, counts=sorted(counts.items()),
                  scores=scores, scores_after=scores_after if scores else None)


@app.get("/campeonato/equipo", response_class=HTMLResponse)
async def meet_team(request: Request, url: str, equipo: str):
    meet = await load_index(url)
    events = await load_all_events(meet)
    rows = []
    for ev in events:
        for r in ev.results:
            if r.team.lower() == equipo.lower():
                rows.append((ev, r))
    return render(request, "team.html", meet=meet, equipo=equipo, rows=rows,
                  live=meet.is_live(hytek.today_us()))


@app.get("/prueba", response_class=HTMLResponse)
async def event_page(request: Request, url: str, meet: str = "", equipo: str = ""):
    meet_index = await load_index(meet) if meet else None
    ttl = ttl_for(meet_index) if meet_index else fetch.LIVE_TTL
    try:
        ev = hytek.parse_event(await fetch.get(url, ttl=ttl), url)
    except Exception:
        return render(request, "pending.html", url=url, meet=meet_index)
    results = [r for r in ev.results if not equipo or r.team.lower() == equipo.lower()]
    live = bool(meet_index and meet_index.is_live(hytek.today_us()))
    return render(request, "event.html", ev=ev, results=results, meet=meet_index, equipo=equipo, live=live)


@app.post("/importar")
async def import_file(fichero: UploadFile = File(...)):
    data = await fichero.read()
    names = store.import_file(data, fichero.filename or "resultados.zip")
    msg = quote(", ".join(names) or "ningún campeonato", safe="")
    return RedirectResponse(f"/?importado={msg}", status_code=303)


@app.get("/meet/{meet_id}", response_class=HTMLResponse)
async def imported_meet(request: Request, meet_id: int, equipo: str = ""):
    meet, swims = store.meet_detail(meet_id)
    clubs = sorted({s["club"] for s in swims if s["club"]})
    if equipo:
        swims = [s for s in swims if s["club"] == equipo]
    events: dict[str, list] = {}
    for s in swims:
        events.setdefault(f'{s["event"]} · {s["session"] or ""}'.strip(" ·"), []).append(s)
    return render(request, "imported.html", meet=meet, events=events, clubs=clubs, equipo=equipo)


@app.get("/buscar", response_class=HTMLResponse)
async def search(request: Request, q: str = ""):
    rows = store.search(q) if len(q) >= 2 else []
    return render(request, "search.html", q=q, rows=rows)


@app.get("/nadador", response_class=HTMLResponse)
async def swimmer(request: Request, nombre: str):
    return render(request, "swimmer.html", nombre=nombre, best=store.best_times(nombre),
                  swims=store.search(nombre))


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


templates.env.filters["slug"] = slug
