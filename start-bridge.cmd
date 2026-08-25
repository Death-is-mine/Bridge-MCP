@echo off
cd /d "D:\Projects\Bridge MCP"

REM Load .env
for /f "tokens=1,* delims==" %%a in ('type .env') do (
    if not "%%a"=="" if not "%%a"=="#" set "%%a=%%b"
)

REM Override with environment variables if set
if defined OPENCODE_SERVER_PASSWORD set "OPENCODE_SERVER_PASSWORD=%OPENCODE_SERVER_PASSWORD%"
if defined BRIDGE_AUTH_SECRET set "BRIDGE_AUTH_SECRET=%BRIDGE_AUTH_SECRET%"
if defined GITHUB_TOKEN set "GITHUB_TOKEN=%GITHUB_TOKEN%"

node packages\bridge\dist\index.js
