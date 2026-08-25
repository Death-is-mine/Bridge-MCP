@echo off
echo ========================================
echo  Bridge-MCP - Full Stack Launcher
echo ========================================
echo.

cd /d "D:\Projects\Bridge MCP"

REM Load .env
for /f "tokens=1,* delims==" %%a in ('type .env') do (
    if not "%%a"=="" if not "%%a"=="#" set "%%a=%%b"
)

REM Build shared package first
echo [0/4] Building shared package...
call npm run build:shared 2>nul

REM 1. Check OpenCode serve
echo [1/4] Checking OpenCode serve...
set "OC_USER=%OPENCODE_SERVER_USERNAME%"
set "OC_PASS=%OPENCODE_SERVER_PASSWORD%"
curl -s -o nul -w "%%{http_code}" http://127.0.0.1:4096/api/health -u %OC_USER%:%OC_PASS% 2>nul | findstr "200" >nul
if %errorlevel%==0 (
    echo   OpenCode serve: RUNNING on :4096
) else (
    echo   OpenCode serve: NOT RUNNING
    echo   Starting OpenCode serve...
    start "" cmd /c "D:\Projects\Bridge MCP\start-oc.cmd"
    timeout /t 5 >nul
)

REM 2. Start Bridge
echo [2/4] Starting Bridge...
netstat -ano | findstr ":3000.*LISTEN" >nul 2>&1
if %errorlevel%==0 (
    echo   Bridge: ALREADY RUNNING on :3000
) else (
    start "" cmd /c "D:\Projects\Bridge MCP\start-bridge.cmd"
    timeout /t 5 >nul
    echo   Bridge: STARTED on :3000
)

REM 3. Start Worker
echo [3/4] Starting Worker...
start "" cmd /c "D:\Projects\Bridge MCP\start-worker.cmd"
timeout /t 3 >nul
echo   Worker: STARTED

REM 4. Start tunnel
echo [4/4] Starting HTTPS tunnel...
start "" cmd /c "D:\Projects\Bridge MCP\start-tunnel.cmd"
timeout /t 12 >nul

echo.
echo ========================================
echo  Dashboard: http://localhost:3000
echo  MCP Endpoint: http://localhost:3000/mcp
echo  Workers connect via: ws://localhost:3000/ws/worker
if exist "D:\Projects\Bridge MCP\tunnel-url.txt" (
    set /p TUNNEL_URL=<"D:\Projects\Bridge MCP\tunnel-url.txt"
    echo.
    echo  Public MCP: %TUNNEL_URL%/mcp
    echo  ChatGPT Setup:
    echo  1. Open ChatGPT Settings ^> Connectors
    echo  2. Add new connector with URL: %TUNNEL_URL%
)
echo ========================================
echo.
echo Press Ctrl+C to stop all services.
pause
