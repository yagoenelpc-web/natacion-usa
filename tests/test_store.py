import io
import sqlite3
import zipfile
from pathlib import Path

import pytest

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture
def store(tmp_path, monkeypatch):
    from app import store as s

    monkeypatch.setattr(s, "DB_PATH", tmp_path / "t.db")
    return s


def test_import_cl2(store):
    names = store.import_file((FIX / "sample.cl2").read_bytes(), "sample.cl2")
    assert names == ["Test Invitational"]
    meets = store.imported_meets()
    assert meets[0]["swims"] == 3 and meets[0]["course"] == "SCY"
    best = store.best_times("Kos, Hubert")
    assert [(b["event"], b["time"]) for b in best] == [("100 Mariposa SCY", "46.90")]
    assert len(store.search("Texas")) == 3


def test_import_zip_and_reimport_replaces(store):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.write(FIX / "sample.cl2", "results/sample.cl2")
    store.import_file(buf.getvalue(), "resultados.zip")
    store.import_file(buf.getvalue(), "resultados.zip")
    assert len(store.imported_meets()) == 1


def test_no_birthdates_stored(store):
    store.import_file((FIX / "sample.cl2").read_bytes(), "sample.cl2")
    dump = "\n".join(sqlite3.connect(store.DB_PATH).iterdump())
    assert "2004" not in dump
