@echo off
set OPENCODE_SERVER_USERNAME=opencode
set OPENCODE_SERVER_PASSWORD=testpass
cd /d "D:\Projects\Bridge MCP\test-project"
call "C:\Users\shrey\AppData\Roaming\npm\opencode.cmd" serve --port 4096 --print-logs > "D:\Projects\Bridge MCP\oc-serve.log" 2>&1
