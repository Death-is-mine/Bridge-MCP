# Security

## Threat model

The Bridge may be reachable from remote AI clients while OpenCode has powerful local execution capabilities.

## Rules

- bind OpenCode to localhost
- authenticate Bridge requests
- validate Origin for browser-facing MCP transports where required
- never expose raw shell execution as a public MCP tool
- use allowlisted repositories/directories
- prevent path traversal
- protect secrets
- use explicit permission checks
- require approval for sensitive actions
- rate-limit remote callers
- audit tool execution

## Repository access

The Bridge must never silently change the selected working directory based on arbitrary user input.
