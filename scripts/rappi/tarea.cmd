@echo off
rem Corrida diaria (Programador de tareas): ventas Rappi de ayer -> app. Bitacora en %LOCALAPPDATA%\dodo-rappi.log
cd /d "%~dp0..\.."
echo ==== %date% %time% >> "%LOCALAPPDATA%\dodo-rappi.log"
call npm run rappi:sincronizar >> "%LOCALAPPDATA%\dodo-rappi.log" 2>&1
exit /b %errorlevel%
