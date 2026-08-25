# API Contract

The Bridge has two API surfaces.

## Browser API

Used by the web GUI.

Examples:
- GET /api/status
- GET /api/sessions
- POST /api/sessions
- POST /api/sessions/:id/messages
- POST /api/sessions/:id/stop
- GET /api/sessions/:id/events
- GET /api/repository/status
- GET /api/repository/diff

## MCP API

Transport and endpoint must follow the selected MCP transport specification.

The MCP surface maps to internal application services rather than directly to database or OS primitives.

## Error format

```json
{
  "error": {
    "code": "OPENCODE_UNAVAILABLE",
    "message": "OpenCode is not reachable",
    "requestId": "..."
  }
}
```
