# Streaming

The Bridge should relay OpenCode progress/events to the web GUI and MCP caller where supported.

## Requirements

- preserve event ordering
- reconnect safely
- avoid duplicate events
- mark disconnected streams
- support session resume

The UI should update live without polling aggressively.
