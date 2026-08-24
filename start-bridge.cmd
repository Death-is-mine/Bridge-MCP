@echo off
set PATH=C:\src\flutter\bin\mingit\cmd;%PATH%
set OPENCODE_BASE_URL=http://127.0.0.1:4096
set OPENCODE_SERVER_USERNAME=opencode
set OPENCODE_SERVER_PASSWORD=testpass
set BRIDGE_PORT=3000
set OPENCODE_TIMEOUT_MS=300000
set GITHUB_TOKEN=%GITHUB_TOKEN%
set GITHUB_REPOSITORY=Death-is-mine/Bridge-MCP
cd /d "D:\Projects\Bridge MCP"
node dist\index.js
