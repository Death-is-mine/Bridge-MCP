# OpenCode Integration

OpenCode is treated as a local coding engine accessed through its supported server/API interface.

## Development setup

Run OpenCode in server mode, bound to localhost.

Example:

```bash
OPENCODE_SERVER_PASSWORD="<secret>" opencode serve --hostname 127.0.0.1 --port 4096
```

Use the OpenCode `/doc` endpoint to inspect the exact API exposed by the installed version.

## Adapter responsibilities

The adapter must:
- authenticate
- create sessions
- send prompts
- read session/event state
- stop sessions
- retrieve diffs where supported
- normalize errors

## Version strategy

Do not hard-code API assumptions from old examples.
Check the installed OpenCode API documentation before upgrading the adapter.

## Failure modes

- OpenCode unavailable
- authentication failure
- session missing
- timeout
- stream disconnect
- malformed API response

All must become structured Bridge errors.
