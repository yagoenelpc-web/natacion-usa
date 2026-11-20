# Natación USA

App web personal para seguir resultados de natación de EE. UU.: NCAA, nacionales y cualquier campeonato que publique resultados con HY-TEK Meet Manager.

## Qué hace

- **En directo:** muestra los campeonatos cuyas fechas incluyen hoy, entre tus campeonatos guardados y el catálogo de [swimmeetresults.tech](https://swimmeetresults.tech/). Las páginas de un campeonato en directo se actualizan solas cada minuto.
- **Cualquier campeonato HY-TEK:** pega la dirección de resultados (por ejemplo `https://swimmeetresults.tech/NCAA-Division-I-Men-2026`) y verás sesiones, pruebas, resultados con parciales y la clasificación por equipos.
- **Universidades:** lista de equipos de cada campeonato con todos sus resultados, y filtro por equipo en cada prueba.
- **Ficheros importados:** sube los .zip, .cl2, .sd3 o .hy3 de HY-TEK para guardarlos en una base de datos local, buscar nadadores y ver sus mejores marcas. Las fechas de nacimiento no se guardan.

## Cómo arrancarla

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
```
