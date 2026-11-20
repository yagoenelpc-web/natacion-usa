# Natación USA

App web personal para seguir resultados de natación de EE. UU.: NCAA, nacionales y cualquier campeonato que publique resultados con HY-TEK Meet Manager.

## En el móvil (Netlify)

La carpeta `web/` es una app para el móvil que se instala en la pantalla de inicio. Netlify la publica gratis desde este repositorio:

1. Entra en https://app.netlify.com con tu cuenta de GitHub.
2. **Add new project** → **Import an existing project** → **GitHub** → `natacion-usa` → **Deploy**. `netlify.toml` ya lo configura todo.
3. Abre la dirección que te da Netlify en el móvil y elige **Añadir a pantalla de inicio** (iPhone: botón Compartir; Android: menú ⋮).

Cada cambio que se suba a la rama `main` se publica solo.

La app del móvil muestra sola los campeonatos del catálogo (en directo, próximamente y recientes), con escudos de las universidades (catálogo público de equipos de ESPN) y logos de NCAA, USA Swimming y Masters (Wikipedia). Marca tus universidades con ★ para verlas destacadas y filtrar.

Para probarla en tu ordenador: `node scripts/dev.mjs` (o `MOCK=1 node scripts/dev.mjs` con datos de prueba, sin internet) y abre http://localhost:8888.

## La versión de ordenador (Python)

### Qué hace

- **En directo:** muestra los campeonatos cuyas fechas incluyen hoy, entre tus campeonatos guardados y el catálogo de [swimmeetresults.tech](https://swimmeetresults.tech/). Las páginas de un campeonato en directo se actualizan solas cada minuto.
- **Cualquier campeonato HY-TEK:** pega la dirección de resultados (por ejemplo `https://swimmeetresults.tech/NCAA-Division-I-Men-2026`) y verás sesiones, pruebas, resultados con parciales y la clasificación por equipos.
- **Universidades:** lista de equipos de cada campeonato con todos sus resultados, y filtro por equipo en cada prueba.
- **Ficheros importados:** sube los .zip, .cl2, .sd3 o .hy3 de HY-TEK para guardarlos en una base de datos local, buscar nadadores y ver sus mejores marcas. Las fechas de nacimiento no se guardan.

## Probarla sin instalar nada

Abre este enlace con tu cuenta de GitHub, pulsa **Create codespace** y espera un par de minutos: la app se abre sola en una pestaña nueva.

[Abrir en GitHub Codespaces](https://codespaces.new/yagoenelpc-web/natacion-usa?quickstart=1)

## En un PC con Windows

1. Instala Python desde https://www.python.org/downloads/ (marca «Add python.exe to PATH»).
2. Descarga el código (botón verde **Code** → **Download ZIP**) y descomprímelo.
3. Haz doble clic en `iniciar.bat`. La app se abre en el navegador.

## Cómo arrancarla (Mac o Linux)

Necesitas Python 3.12 o superior.

```bash
python3 -m venv .venv
source .venv/bin/activate        # En Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Abre http://127.0.0.1:8000 en el navegador.

## De dónde salen los datos

- Las páginas públicas de resultados HY-TEK (“HY-TEK Real Time Results”) que publican los organizadores. La app las lee con caché: como mucho una vez por minuto en directo y cada 6 horas si el campeonato ya terminó, y nunca más de 4 peticiones a la vez.
- Los ficheros de resultados que tú subas.
- No lee el Data Hub de USA Swimming ni SwimCloud, porque sus condiciones de uso prohíben el acceso automatizado.

Muchas universidades enlazan sus resultados en directo (“Live Results”) desde la web de su equipo. Si es una página HY-TEK, pégala en la portada y pulsa «Guardar»: a partir de ahí aparecerá en «En directo» mientras dure.

## Configuración

| Variable | Para qué | Por defecto |
| --- | --- | --- |
| `NATACION_DB` | Ruta del fichero SQLite | `natacion.db` en la raíz |
| `NATACION_CATALOGOS` | Portadas de catálogo separadas por comas | `https://swimmeetresults.tech/` |

## Pruebas

```bash
pip install -r requirements-dev.txt
pytest
npm test
```
