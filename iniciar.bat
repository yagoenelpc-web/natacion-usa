@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
  echo Necesitas instalar Python desde https://www.python.org/downloads/
  pause
  exit /b 1
)
if not exist .venv py -3 -m venv .venv
call .venv\Scripts\activate.bat
python -m pip install -q -r requirements.txt
start "" http://127.0.0.1:8000
python -m uvicorn app.main:app --port 8000
pause
