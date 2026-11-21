// Pantalla para entrar o crear la cuenta (con código de invitación). Sale antes de cargar la app.
const TXT = {
  es: {
    lang: "es", sub: "App privada. Entra con tu usuario.", entrar: "Entrar", crear: "Crear cuenta", usuario: "Usuario", clave: "Contraseña",
    clave2: "Repite la contraseña", codigo: "Código de invitación", btnEntrar: "Entrar", btnCrear: "Crear mi cuenta",
    ayuda: "¿No tienes código? Pídeselo a quien te invitó.", distintas: "Las contraseñas no coinciden.", red: "Sin conexión. Inténtalo otra vez.",
    pistaU: "3 a 30 letras o números, sin espacios", pistaC: "Mínimo 6 caracteres",
  },
  en: {
    lang: "en", sub: "Private app. Sign in with your username.", entrar: "Sign in", crear: "Create account", usuario: "Username", clave: "Password",
    clave2: "Repeat password", codigo: "Invitation code", btnEntrar: "Sign in", btnCrear: "Create my account",
    ayuda: "No code? Ask the person who invited you.", distintas: "Passwords don't match.", red: "No connection. Try again.",
    pistaU: "3 to 30 letters or numbers, no spaces", pistaC: "At least 6 characters",
  },
};
const ERR_EN = {
  "Usuario o contraseña incorrectos.": "Wrong username or password.",
  "Demasiados intentos. Prueba dentro de 15 minutos.": "Too many attempts. Try again in 15 minutes.",
  "El usuario debe tener de 3 a 30 letras o números (sin espacios).": "Username must be 3 to 30 letters or numbers (no spaces).",
  "La contraseña debe tener al menos 6 caracteres.": "Password must be at least 6 characters.",
  "Ese código no existe o ya se ha usado.": "That code doesn't exist or was already used.",
  "Ese usuario ya existe. Elige otro.": "That username is taken. Choose another.",
};

export function paginaEntrar(acceptLang) {
  const t = /^en\b/i.test(acceptLang) ? TXT.en : TXT.es;
  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>USA Results</title>
<meta name="robots" content="noindex">
<meta name="theme-color" content="#0b3d91">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icons/icon-192.png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<style>
:root { --bg1: #eef3fb; --bg2: #f7f8fc; --card: rgba(255,255,255,.9); --line: rgba(15,40,90,.12); --text: #0c1830; --muted: #56647c; --brand: #0a64e0; --brand2: #1689ff; --err: #d92d4b; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root { --bg1: #070d1c; --bg2: #0d0a1f; --card: rgba(30,40,62,.75); --line: rgba(255,255,255,.14); --text: #eef3ff; --muted: #9fb0cc; --brand: #5aa8ff; --brand2: #7cc0ff; --err: #ff6b84; color-scheme: dark; } }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; font: 16px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif; color: var(--text);
  background: radial-gradient(60% 50% at 15% 10%, rgba(56,140,255,.22), transparent 70%), radial-gradient(50% 40% at 90% 30%, rgba(0,210,200,.16), transparent 70%), radial-gradient(60% 50% at 50% 100%, rgba(255,120,170,.12), transparent 70%), linear-gradient(var(--bg1), var(--bg2)); }
main { width: 100%; max-width: 380px; }
.logo { text-align: center; margin-bottom: 18px; }
.logo img { width: 72px; height: 72px; border-radius: 18px; box-shadow: 0 6px 20px rgba(20,50,110,.18); }
h1 { margin: 10px 0 2px; font-size: 26px; letter-spacing: -.02em; }
.logo p { margin: 0; color: var(--muted); font-size: 14.5px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 24px; padding: 18px; box-shadow: 0 4px 16px rgba(20,50,110,.08); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }
.seg { display: flex; background: rgba(120,140,170,.14); border-radius: 12px; padding: 3px; margin-bottom: 16px; }
.seg button { flex: 1; border: 0; background: none; padding: 9px; border-radius: 10px; font: inherit; font-weight: 600; font-size: 14.5px; color: var(--muted); cursor: pointer; }
.seg button.on { background: var(--card); color: var(--text); box-shadow: 0 1px 4px rgba(0,0,0,.12); }
label { display: block; font-size: 13px; font-weight: 600; color: var(--muted); margin: 10px 2px 5px; }
label small { font-weight: 400; }
input { width: 100%; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--line); background: rgba(255,255,255,.6); color: var(--text); font: inherit; font-size: 16px; outline: none; }
@media (prefers-color-scheme: dark) { input { background: rgba(0,0,0,.25); } }
input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px rgba(22,137,255,.2); }
#codigo { text-transform: uppercase; letter-spacing: .08em; }
button.go { width: 100%; margin-top: 18px; padding: 13px; border: 0; border-radius: 14px; font: inherit; font-weight: 700; color: #fff; background: linear-gradient(135deg, var(--brand), var(--brand2)); cursor: pointer; }
button.go:disabled { opacity: .6; }
.err { color: var(--err); font-size: 14px; margin: 12px 2px 0; min-height: 1em; }
.help { text-align: center; color: var(--muted); font-size: 13px; margin-top: 14px; }
[hidden] { display: none !important; }
</style>
</head>
<body>
<main>
  <div class="logo"><img src="/icons/icon-192.png" alt=""><h1>USA Results</h1><p>${t.sub}</p></div>
  <div class="card">
    <div class="seg"><button type="button" class="on" data-m="in">${t.entrar}</button><button type="button" data-m="up">${t.crear}</button></div>
    <form id="f" autocomplete="on">
      <div class="up" hidden><label for="codigo">${t.codigo}</label><input id="codigo" name="codigo" autocomplete="one-time-code" autocapitalize="characters" placeholder="XXXX-XXXX-XXXX"></div>
      <label for="usuario">${t.usuario} <small class="up" hidden>· ${t.pistaU}</small></label><input id="usuario" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required>
      <label for="clave">${t.clave} <small class="up" hidden>· ${t.pistaC}</small></label><input id="clave" name="password" type="password" autocomplete="current-password" required>
      <div class="up" hidden><label for="clave2">${t.clave2}</label><input id="clave2" type="password" autocomplete="new-password"></div>
      <p class="err" id="err" role="alert"></p>
      <button class="go" id="go">${t.btnEntrar}</button>
    </form>
    <p class="help up" hidden>${t.ayuda}</p>
  </div>
</main>
<script>
const T = ${JSON.stringify(t)}, EN = ${JSON.stringify(t.lang === "en" ? ERR_EN : {})};
let modo = new URLSearchParams(location.search).has("codigo") ? "up" : "in";
const $ = (id) => document.getElementById(id);
function pon(m) {
  modo = m;
  document.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("on", b.dataset.m === m));
  document.querySelectorAll(".up").forEach((e) => (e.hidden = m !== "up"));
  $("go").textContent = m === "up" ? T.btnCrear : T.btnEntrar;
  $("clave").autocomplete = m === "up" ? "new-password" : "current-password";
  $("err").textContent = "";
}
document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => pon(b.dataset.m)));
const c0 = new URLSearchParams(location.search).get("codigo");
if (c0) $("codigo").value = c0;
pon(modo);
$("f").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("err").textContent = "";
  if (modo === "up" && $("clave").value !== $("clave2").value) { $("err").textContent = T.distintas; return; }
  $("go").disabled = true;
  try {
    const r = await fetch(modo === "up" ? "/api/acceso/registro" : "/api/acceso/entrar", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ usuario: $("usuario").value, clave: $("clave").value, codigo: $("codigo").value }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) { location.replace("/"); return; }
    $("err").textContent = EN[j.error] || j.error || T.red;
  } catch { $("err").textContent = T.red; }
  $("go").disabled = false;
});
</script>
</body>
</html>`;
}
