@echo off
echo ========================================
echo  Bridge-MCP - Full Stack Launcher
echo ========================================
echo.

REM 1. Check OpenCode serve
echo [1/3] Checking OpenCode serve...
curl -s -o nul -w "%%{http_code}" http://127.0.0.1:4096/api/health -u opencode:testpass 2>nul | findstr "200" >nul
if %errorlevel%==0 (
    echo   OpenCode serve: RUNNING on :4096
) else (
    echo   OpenCode serve: NOT RUNNING
    echo   Starting OpenCode serve...
    start "" cmd /c "D:\Projects\Bridge MCP\start-oc.cmd"
    timeout /t 5 >nul
)

REM 2. Start Bridge-MCP
echo [2/3] Starting Bridge-MCP...
netstat -ano | findstr ":3000.*LISTEN" >nul 2>&1
if %errorlevel%==0 (
    echo   Bridge: ALREADY RUNNING on :3000
) else (
    start "" cmd /c "D:\Projects\Bridge MCP\start-bridge.cmd"
    timeout /t 5 >nul
    echo   Bridge: STARTED on :3000
)

REM 3. Start tunnel
echo [3/3] Starting HTTPS tunnel...
start "" cmd /c "D:\Projects\Bridge MCP\start-tunnel.cmd"
timeout /t 12 >nul

echo.
echo ========================================
if exist "D:\Projects\Bridge MCP\tunnel-url.txt" (
    set /p TUNNEL_URL=<"D:\Projects\Bridge MCP\tunnel-url.txt"
    echo  MCP Endpoint: %TUNNEL_URL%/mcp
    echo  OAuth Metadata: %TUNNEL_URL%/.well-known/oauth-authorization-server
    echo.
    echo  ChatGPT Setup:
    echo  1. Open ChatGPT Settings > Connectors
    echo  2. Add new connector with URL: %TUNNEL_URL%
    echo  3. ChatGPT will auto-discover OAuth and MCP
) else (
    echo  Tunnel URL not available yet. Check tunnel-url.txt in a moment.
)
echo ========================================
echo.
echo Press Ctrl+C to stop all services.
pause
