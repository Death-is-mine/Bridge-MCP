# MCP Specification

## Exposed tools

### bridge.status
Return bridge health, OpenCode health, version, and active workspace.

### opencode.sessions.list
List available OpenCode sessions.

### opencode.session.create
Create a new OpenCode session.

### opencode.session.send
Send a coding instruction to a session.

### opencode.session.stream
Subscribe to session progress/events.

### opencode.session.stop
Stop a running session.

### repository.status
Return git status for the selected repository.

### repository.diff
Return the current diff.

### github.review
Fetch review information when GitHub integration is configured.

### bridge.approval.request
Create an approval request for a sensitive action.

## Tool contract

Every tool request has:
- requestId
- user/session identity
- workspace/repository context
- validated arguments

Every result has:
- requestId
- status
- output or structured error
- timestamps

## Important

MCP tools are capabilities, not unrestricted commands.

Never expose a `shell.exec(command: string)` tool in the public MCP surface.
