# System Architecture

```text
MCP-capable AI client
        |
        | MCP / authenticated HTTP
        v
+----------------------+
| MCP Bridge Gateway   |
| auth / policy / logs |
+----------+-----------+
           |
           | OpenCode HTTP API
           v
+----------------------+
| OpenCode Server      |
+----------+-----------+
           |
           v
   Local repository
           |
     git / tests / diff
           |
           v
        GitHub
```

## Components

### Web GUI
Presents state and controls. It does not execute shell commands.

### MCP Bridge
Receives MCP requests, validates them, resolves session/repository context, checks permissions, and calls OpenCode.

### OpenCode adapter
Encapsulates the OpenCode HTTP API. Do not scatter OpenCode-specific HTTP calls throughout the application.

### Session manager
Maps external AI sessions to OpenCode sessions.

### Repository manager
Reads git metadata and exposes safe repository operations.

### GitHub adapter
Optional integration for commit, push, PR/review workflows.

### Audit system
Records who requested what, which OpenCode session ran, and the result.

## Deployment

Default local mode:

Browser → local Bridge → localhost OpenCode.

Remote access must use an authenticated secure tunnel or equivalent private networking.

## Boundaries

The browser never receives OpenCode secrets.

The MCP surface never exposes arbitrary internal implementation details.

The OpenCode adapter is the only layer that knows exact OpenCode API calls.
