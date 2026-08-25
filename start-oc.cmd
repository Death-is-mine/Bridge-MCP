@echo off
cd /d "D:\Projects\Bridge MCP\test-project"

REM Load .env
for /f "tokens=1,* delims==" %%a in ('type "D:\Projects\Bridge MCP\.env"') do (
    if not "%%a"=="" if not "%%a"=="#" set "%%a=%%b"
)

call "C:\Users\shrey\AppData\Roaming\npm\opencode.cmd" serve --port 4096 --print-logs > "D:\Projects\Bridge MCP\oc-serve.log" 2>&1
