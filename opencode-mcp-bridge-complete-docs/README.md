# OpenCode MCP Bridge

A web-first MCP control plane that connects MCP-capable AI clients to a local OpenCode server.

## Goal

Allow a user to issue a coding command from an AI client or the Bridge web GUI:

AI client → MCP Bridge → OpenCode → local repository → tests/diff → GitHub review → feedback → OpenCode.

## Core principle

- The AI client decides intent.
- The MCP Bridge exposes safe control tools.
- OpenCode is the local coding executor.
- GitHub is the source-control and review system.
- The browser is only the control UI.

## First milestone

Build a minimal, secure vertical slice:

1. Start OpenCode server locally.
2. Bridge connects to OpenCode.
3. Web GUI shows connection/session status.
4. MCP client can send a prompt to OpenCode.
5. Bridge streams progress.
6. User can inspect diff and stop execution.

Do not begin with unrestricted shell access or autonomous production deployment.
