@echo off
cd /d "D:\Projects\Bridge MCP"

REM Load .env
for /f "tokens=1,* delims==" %%a in ('type .env') do (
    if not "%%a"=="" if not "%%a"=="#" set "%%a=%%b"
)

REM Generate worker token if not set
if not defined WORKER_TOKEN (
    echo Generating worker token...
    for /f "delims=" %%i in ('powershell -Command "[guid]::NewGuid().ToString()"') do set WORKER_TOKEN=%%i
    echo WORKER_TOKEN=%WORKER_TOKEN%>> .env
    echo.
    echo IMPORTANT: Save this token. You'll need it for reconnection.
    echo WORKER_TOKEN=%WORKER_TOKEN%
    echo.
)

node packages\worker\dist\index.js
