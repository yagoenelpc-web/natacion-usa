"""Base de datos SQLite: campeonatos guardados e importaciones de ficheros .cl2/.hy3."""

from __future__ import annotations

import os
import sqlite3
import tempfile
from pathlib import Path

DB_PATH = Path(os.environ.get("NATACION_DB", Path(__file__).resolve().parent.parent / "natacion.db"))

SCHEMA = """
create table if not exists saved_meet (
    url text primary key,
    name text not null,
    added_at text default current_timestamp
);
create table if not exists meet (
    id integer primary key,
    name text not null,
    start_date text,
    end_date text,
    city text,
    state text,
    course text,
    source text,
    unique (name, start_date)
);
create table if not exists swim (
    id integer primary key,
    meet_id integer not null references meet(id) on delete cascade,
    event text not null,
    session text,
    swimmer text,
    club text,
    time text,
    centis integer,
    place integer,
    is_relay integer default 0
);
create index if not exists swim_swimmer on swim(swimmer);
create index if not exists swim_club on swim(club);
create index if not exists swim_event on swim(event);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("pragma foreign_keys = on")
    conn.executescript(SCHEMA)
    return conn


# --- campeonatos HY-TEK guardados ---------------------------------------

def save_meet(url: str, name: str) -> None:
    with connect() as c:
        c.execute("insert or replace into saved_meet(url, name) values (?, ?)", (url, name))


def remove_meet(url: str) -> None:
    with connect() as c:
        c.execute("delete from saved_meet where url = ?", (url,))


def saved_meets() -> list[sqlite3.Row]:
    with connect() as c:
        return c.execute("select * from saved_meet order by added_at desc").fetchall()


# --- importación de ficheros --------------------------------------------

def _event_label(event) -> str:
    try:
        stroke = {
            "FREESTYLE": "Libre", "BACKSTROKE": "Espalda", "BREASTSTROKE": "Braza",
            "BUTTERFLY": "Mariposa", "INDIVIDUAL_MEDLEY": "Estilos",
            "FREESTYLE_RELAY": "Relevo libre", "MEDLEY_RELAY": "Relevo estilos",
        }.get(event.stroke.name, event.stroke.name.title())
        return f"{event.distance} {stroke} {event.course.name}"
    except Exception:
        return str(event)


def _club_name(club) -> str:
    if club is None:
        return ""
    return club.full_name or club.short_name or club.abbreviated_name or club.team_code or ""


def import_file(data: bytes, filename: str) -> list[str]:
    """Importa un fichero .cl2, .sd3, .hy3 o un .zip de HY-TEK. Devuelve los nombres de los meets."""
    import zipfile

    from tunas import read_cl2, read_hy3

    imported: list[str] = []
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        paths: list[Path] = []
        if filename.lower().endswith(".zip"):
            zpath = tmpdir / "upload.zip"
            zpath.write_bytes(data)
            with zipfile.ZipFile(zpath) as zf:
                for member in zf.namelist():
                    name = Path(member).name
                    if name.lower().endswith((".cl2", ".sd3", ".hy3")):
                        target = tmpdir / name
                        target.write_bytes(zf.read(member))
                        paths.append(target)
        else:
            target = tmpdir / Path(filename).name
            target.write_bytes(data)
            paths.append(target)

        # Si el zip trae .hy3 y .cl2 del mismo meet, el .hy3 tiene más detalle.
        hy3 = [p for p in paths if p.suffix.lower() == ".hy3"]
        chosen = hy3 or paths
        for path in chosen:
            reader = read_hy3 if path.suffix.lower() == ".hy3" else read_cl2
            for archive in reader(str(path)):
                for meet in archive.meets:
                    imported.append(_store_meet(meet, path.name))
    return imported


def _store_meet(meet, source: str) -> str:
    with connect() as c:
        c.execute(
            "delete from meet where name = ? and start_date = ?",
            (meet.name, meet.start_date.isoformat() if meet.start_date else None),
        )
        cur = c.execute(
            "insert into meet(name, start_date, end_date, city, state, course, source) values (?,?,?,?,?,?,?)",
            (
                meet.name,
                meet.start_date.isoformat() if meet.start_date else None,
                meet.end_date.isoformat() if meet.end_date else None,
                meet.city,
                getattr(meet.state, "name", None) if meet.state else None,
                getattr(meet.course, "name", None) if meet.course else None,
                source,
            ),
        )
        meet_id = cur.lastrowid
        rows = []
        for r in meet.results:
            is_relay = hasattr(r, "relay_letter")
            if is_relay:
                who = f"{_club_name(r.club)} {r.relay_letter or ''}".strip()
            else:
                sw = r.swimmer
                # Nunca se guarda la fecha de nacimiento ni otros datos personales.
                who = f"{sw.last_name}, {sw.preferred_first_name or sw.first_name}".strip(", ")
            t = r.time
            rows.append((
                meet_id,
                _event_label(r.event),
                getattr(r.session, "name", None),
                who,
                _club_name(r.club),
                str(t) if t is not None else (getattr(r.status, "name", "") or ""),
                t.centiseconds if t is not None else None,
                r.rank,
                int(is_relay),
            ))
        c.executemany(
            "insert into swim(meet_id, event, session, swimmer, club, time, centis, place, is_relay) values (?,?,?,?,?,?,?,?,?)",
            rows,
        )
    return meet.name


def imported_meets() -> list[sqlite3.Row]:
    with connect() as c:
        return c.execute(
            "select m.*, count(s.id) as swims from meet m left join swim s on s.meet_id = m.id "
            "group by m.id order by m.start_date desc"
        ).fetchall()


def meet_detail(meet_id: int):
    with connect() as c:
        meet = c.execute("select * from meet where id = ?", (meet_id,)).fetchone()
        swims = c.execute(
            "select * from swim where meet_id = ? order by event, session, coalesce(place, 999), centis",
            (meet_id,),
        ).fetchall()
    return meet, swims


def search(q: str) -> list[sqlite3.Row]:
    like = f"%{q}%"
    with connect() as c:
        return c.execute(
            "select s.*, m.name as meet_name, m.start_date from swim s join meet m on m.id = s.meet_id "
            "where s.swimmer like ? or s.club like ? order by s.swimmer, s.event, s.centis limit 500",
            (like, like),
        ).fetchall()


def best_times(swimmer: str) -> list[sqlite3.Row]:
    with connect() as c:
        return c.execute(
            "select s.event, min(s.centis) as centis, s.time, m.name as meet_name, m.start_date "
            "from swim s join meet m on m.id = s.meet_id where s.swimmer = ? and s.centis is not null "
            "group by s.event order by s.event",
            (swimmer,),
        ).fetchall()
