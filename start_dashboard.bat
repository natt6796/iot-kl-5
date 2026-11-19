@echo off
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 goto use_py
where python >nul 2>nul
if %errorlevel%==0 goto use_python

echo Python was not found. Install Python 3, then run this file again.
pause
exit /b 1

:use_py
py -3 -c "import fastapi, uvicorn" >nul 2>nul
if errorlevel 1 (
  echo Installing FastAPI backend dependencies...
  py -3 -m pip install -r requirements.txt
  if errorlevel 1 goto failed
)
start "" "http://localhost:8000"
py -3 server.py
goto finished

:use_python
python -c "import fastapi, uvicorn" >nul 2>nul
if errorlevel 1 (
  echo Installing FastAPI backend dependencies...
  python -m pip install -r requirements.txt
  if errorlevel 1 goto failed
)
start "" "http://localhost:8000"
python server.py
goto finished

:failed
echo Could not install backend dependencies. Check your internet connection and try again.
pause
exit /b 1

:finished
if errorlevel 1 pause
