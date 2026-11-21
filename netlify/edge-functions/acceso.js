// Acceso privado a la app: solo entra quien tiene usuario y contraseña.
// Para crear la cuenta hace falta un código de invitación de un solo uso.
// - Los códigos iniciales están en codigos.js solo como huella SHA-256 (no se pueden sacar de ahí).
// - El administrador puede crear más códigos desde la app (Ajustes → Invitaciones).
// - Cuentas, códigos usados y la clave de las sesiones se guardan en Netlify Blobs (privado, no en GitHub).
import { getStore } from "@netlify/blobs";
import { CODIGOS } from "./codigos.js";
import { paginaEntrar } from "./entrar.js";

export const config = {
  path: "/*",
  excludedPath: ["/icons/*", "/manifest.webmanifest", "/favicon.ico", "/robots.txt"],
};

const COOKIE = "ur_s";
const DIAS = 180;
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const json = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
const store = () => getStore({ name: "acceso", consistency: "strong" });
export const limpiaUsuario = (u) => String(u || "").trim().toLowerCase();
export const usuarioValido = (u) => /^[a-z0-9._-]{3,30}$/.test(u);
export const limpiaCodigo = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// Clave de las sesiones: se crea sola la primera vez y se guarda en Blobs.
let clave = null;
async function hmacKey(st) {
  if (clave) return clave;
  let raw = await st.get("clave");
  if (!raw) {
    raw = hex(crypto.getRandomValues(new Uint8Array(32)));
    await st.set("clave", raw, { onlyIfNew: true }).catch(() => {});
    raw = (await st.get("clave")) || raw;
  }
  clave = await crypto.subtle.importKey("raw", enc.encode(raw), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return clave;
}
const firma = async (st, s) => hex(await crypto.subtle.sign("HMAC", await hmacKey(st), enc.encode(s)));

export async function hashPass(pass, salt) {
  const k = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 20000 }, k, 256));
}
// Comparación sin atajos (para no dar pistas por el tiempo de respuesta).
const igual = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };

// Cuentas en memoria unos minutos, para no leer Blobs en cada petición.
const cache = new Map();
async function cuenta(st, u) {
  const c = cache.get(u);
  if (c && Date.now() - c.t < 120000) return c.v;
  const v = await st.get("u/" + u, { type: "json" });
  cache.set(u, { v, t: Date.now() });
  return v;
}

async function sesion(st, req) {
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.get("cookie") || "");
  if (!m) return null;
  // usuario.caducidad.versión.firma (el usuario puede llevar puntos: se lee desde el final).
  const parts = decodeURIComponent(m[1]).split(".");
  if (parts.length < 4) return null;
  const [sig, v, exp] = [parts.pop(), parts.pop(), parts.pop()], u = parts.join(".");
  if (!u || !sig || +exp < Date.now() / 1000) return null;
  if (!igual(sig, await firma(st, `${u}.${exp}.${v}`))) return null;
  const c = await cuenta(st, u);
  if (!c || String(c.v || 0) !== v) return null;
  return { u, admin: !!c.admin };
}
async function cookieDe(st, u, c) {
  const exp = Math.floor(Date.now() / 1000) + DIAS * 86400;
  const val = `${u}.${exp}.${c.v || 0}`;
  return `${COOKIE}=${encodeURIComponent(val + "." + (await firma(st, val)))}; Path=/; Max-Age=${DIAS * 86400}; HttpOnly; Secure; SameSite=Lax`;
}

// ¿Es un código válido y sin usar? Devuelve si da permisos de administrador.
async function codigoLibre(st, code) {
  if (code.length < 8) return null;
  const h = await sha(code);
  if (await st.get("usado/" + h)) return null;
  const ini = CODIGOS.find((x) => x.h === h);
  if (ini) return { h, admin: !!ini.admin };
  const nuevo = await st.get("codigo/" + h, { type: "json" });
  return nuevo ? { h, admin: false } : null;
}
const ALFA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const nuevoCodigo = () => { const b = crypto.getRandomValues(new Uint8Array(12)); const s = [...b].map((x) => ALFA[x % 32]).join(""); return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`; };

// Freno a quien prueba muchas contraseñas: 10 fallos seguidos → 15 minutos sin poder entrar.
async function frenado(st, u) { const f = await st.get("fallos/" + u, { type: "json" }); return f && f.n >= 10 && Date.now() - f.t < 15 * 60000; }
async function fallo(st, u) { const f = (await st.get("fallos/" + u, { type: "json" })) || { n: 0 }; await st.setJSON("fallos/" + u, { n: (Date.now() - (f.t || 0) > 15 * 60000 ? 0 : f.n) + 1, t: Date.now() }); }

async function api(st, req, path) {
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  if (path === "/api/acceso/entrar" && req.method === "POST") {
    const u = limpiaUsuario(body.usuario), p = String(body.clave || "");
    if (!usuarioValido(u) || !p) return json({ error: "Usuario o contraseña incorrectos." }, 400);
    if (await frenado(st, u)) return json({ error: "Demasiados intentos. Prueba dentro de 15 minutos." }, 429);
    const c = await st.get("u/" + u, { type: "json" });
    if (!c || !igual(await hashPass(p, c.salt), c.hash)) { await fallo(st, u); return json({ error: "Usuario o contraseña incorrectos." }, 401); }
    await st.delete("fallos/" + u).catch(() => {});
    return json({ ok: true }, 200, { "set-cookie": await cookieDe(st, u, c) });
  }
  if (path === "/api/acceso/registro" && req.method === "POST") {
    const u = limpiaUsuario(body.usuario), p = String(body.clave || ""), code = limpiaCodigo(body.codigo);
    if (!usuarioValido(u)) return json({ error: "El usuario debe tener de 3 a 30 letras o números (sin espacios)." }, 400);
    if (p.length < 6) return json({ error: "La contraseña debe tener al menos 6 caracteres." }, 400);
    const ok = await codigoLibre(st, code);
    if (!ok) return json({ error: "Ese código no existe o ya se ha usado." }, 400);
    if (await st.get("u/" + u)) return json({ error: "Ese usuario ya existe. Elige otro." }, 409);
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    const c = { salt, hash: await hashPass(p, salt), admin: ok.admin, v: 1, creado: new Date().toISOString().slice(0, 10), codigo: ok.h.slice(0, 8) };
    await st.setJSON("u/" + u, c);
    await st.setJSON("usado/" + ok.h, { u, t: c.creado });
    await st.delete("codigo/" + ok.h).catch(() => {});
    cache.delete(u);
    return json({ ok: true }, 200, { "set-cookie": await cookieDe(st, u, c) });
  }
  if (path === "/api/acceso/salir") return json({ ok: true }, 200, { "set-cookie": `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` });
  // A partir de aquí, solo con sesión.
  const s = await sesion(st, req);
  if (!s) return json({ error: "Sin sesión." }, 401);
  if (path === "/api/acceso/yo") return json({ usuario: s.u, admin: s.admin });
  if (path === "/api/acceso/clave" && req.method === "POST") {
    const c = await st.get("u/" + s.u, { type: "json" });
    if (!c || !igual(await hashPass(String(body.actual || ""), c.salt), c.hash)) return json({ error: "La contraseña actual no es correcta." }, 400);
    if (String(body.nueva || "").length < 6) return json({ error: "La contraseña debe tener al menos 6 caracteres." }, 400);
    c.salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    c.hash = await hashPass(String(body.nueva), c.salt);
    c.v = (c.v || 0) + 1;
    await st.setJSON("u/" + s.u, c);
    cache.delete(s.u);
    return json({ ok: true }, 200, { "set-cookie": await cookieDe(st, s.u, c) });
  }
  if (!s.admin) return json({ error: "Solo el administrador." }, 403);
  if (path === "/api/acceso/codigo" && req.method === "POST") {
    const code = nuevoCodigo(), h = await sha(limpiaCodigo(code));
    await st.setJSON("codigo/" + h, { t: new Date().toISOString().slice(0, 10), nota: String(body.nota || "").slice(0, 60) });
    return json({ codigo: code });
  }
  if (path === "/api/acceso/usuarios") {
    const { blobs } = await st.list({ prefix: "u/" });
    const users = [];
    for (const b of blobs) { const c = await st.get(b.key, { type: "json" }); if (c) users.push({ usuario: b.key.slice(2), admin: !!c.admin, creado: c.creado || "" }); }
    const pend = (await st.list({ prefix: "codigo/" })).blobs.length;
    return json({ usuarios: users.sort((a, b) => a.usuario.localeCompare(b.usuario)), codigosSinUsar: pend });
  }
  if (path === "/api/acceso/quitar" && req.method === "POST") {
    const u = limpiaUsuario(body.usuario);
    if (!u || u === s.u) return json({ error: "No puedes quitarte a ti mismo." }, 400);
    await st.delete("u/" + u);
    cache.delete(u);
    return json({ ok: true });
  }
  return json({ error: "No existe." }, 404);
}

export default async (req, context) => {
  const url = new URL(req.url);
  const st = store();
  if (url.pathname.startsWith("/api/acceso/")) return api(st, req, url.pathname);
  if (url.pathname === "/entrar") {
    if (await sesion(st, req)) return Response.redirect(new URL("/", url), 302);
    return new Response(paginaEntrar(req.headers.get("accept-language") || ""), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }
  if (await sesion(st, req)) return context.next();
  const nav = req.method === "GET" && (req.headers.get("sec-fetch-mode") === "navigate" || (req.headers.get("accept") || "").includes("text/html"));
  if (nav) return Response.redirect(new URL("/entrar", url), 302);
  return new Response("Necesitas entrar con tu usuario.", { status: 401, headers: { "cache-control": "no-store" } });
};
