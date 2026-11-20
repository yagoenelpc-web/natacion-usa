"""Descarga de páginas con caché en memoria y límite de peticiones simultáneas."""

from __future__ import annotations

import asyncio
import time

import httpx

USER_AGENT = "natacion-usa/0.1 (app personal de resultados)"
LIVE_TTL = 60  # segundos: un campeonato en directo se refresca cada minuto
DONE_TTL = 6 * 3600

_cache: dict[str, tuple[float, str]] = {}
_sem = asyncio.Semaphore(4)
_client: httpx.AsyncClient | None = None


def client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            headers={"User-Agent": USER_AGENT},
            timeout=20,
            follow_redirects=True,
        )
    return _client


async def get(url: str, ttl: int = LIVE_TTL) -> str:
    now = time.monotonic()
    hit = _cache.get(url)
    if hit and now - hit[0] < ttl:
        return hit[1]
    async with _sem:
        resp = await client().get(url)
        resp.raise_for_status()
        # HY-TEK publica en Windows-1252; httpx lo detecta si viene en la cabecera.
        text = resp.text
    _cache[url] = (time.monotonic(), text)
    return text


async def get_many(urls: list[str], ttl: int = LIVE_TTL) -> dict[str, str | Exception]:
    async def one(u: str):
        try:
            return u, await get(u, ttl)
        except Exception as exc:  # una prueba sin publicar no debe tumbar la página
            return u, exc

    return dict(await asyncio.gather(*(one(u) for u in urls)))


def clear() -> None:
    _cache.clear()
