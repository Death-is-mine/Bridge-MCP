# Bridge-MCP Production Architecture

## Overview

Bridge-MCP is a production-grade bridge between AI clients (ChatGPT, other MCP clients) and local coding environments (OpenCode + git repositories).

```
┌─────────────────────────────────────────────────┐
│                  AI CLIENT                       │
│            (ChatGPT / MCP client)                │
└──────────────────────┬──────────────────────────┘
                       │ MCP (StreamableHTTP)
                       ▼
┌─────────────────────────────────────────────────┐
│              REMOTE BRIDGE                       │
│  • MCP server (StreamableHTTP)                  │
│  • OAuth 2.1 authorization                      │
│  • SQLite persistence                           │
│  • WebSocket server for Workers                 │
│  • Session management                           │
│  • Approval system                              │
│  • Audit logging                                │
│  • Web dashboard                                │
└──────────────────────┬──────────────────────────┘
                       │ WebSocket (outbound from Worker)
                       ▼
┌─────────────────────────────────────────────────┐
│              LOCAL WORKER                        │
│  • Connects outbound to Bridge                  │
│  • Auto-discovers OpenCode                      │
│  • Executes coding work                         │
│  • Manages local repositories                   │
│  • Reports results back                         │
└─────────────────────────────────────────────────┘
```

## Packages

### `@bridge-mcp/shared`
Shared TypeScript types, WebSocket protocol definitions, MCP tool schemas, and input validators.

### `@bridge-mcp/bridge`
Remote MCP server with:
- Express HTTP server
- StreamableHTTP MCP transport
- SQLite database (better-sqlite3)
- WebSocket server for Worker connections
- OAuth 2.1 authorization server
- Web dashboard

### `@bridge-mcp/worker`
Local process that:
- Connects outbound to Bridge via WebSocket
- Auto-discovers OpenCode on localhost
- Executes coding work via OpenCode API
- Accesses local repositories (allowlisted)
- Reports results back to Bridge

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Build packages
```bash
npm run build
```

### 3. Configure
Edit `.env`:
```env
BRIDGE_PORT=3000
OPENCODE_SERVER_USERNAME=opencode
OPENCODE_SERVER_PASSWORD=your_password
ALLOWED_REPOSITORIES=/path/to/your/repo
```

### 4. Start everything
```bash
# Windows
start-all.cmd

# Or manually:
# Terminal 1: Bridge
npm run start:bridge

# Terminal 2: Worker
npm run start:worker
```

### 5. Connect ChatGPT
1. Open ChatGPT → Settings → Connectors
2. Add connector with URL: `http://localhost:3000`
3. ChatGPT auto-discovers OAuth and MCP

## Architecture Details

### Bridge (packages/bridge/)
- **Port**: 3000 (configurable via `BRIDGE_PORT`)
- **Database**: SQLite at `./bridge.db`
- **MCP Endpoint**: `POST /mcp` (StreamableHTTP)
- **Worker WebSocket**: `ws://host:port/ws/worker`
- **Dashboard**: `GET /` (web/index.html)
- **Health**: `GET /health`
- **OAuth**: `/.well-known/oauth-authorization-server`

### Worker (packages/worker/)
- **Connects to**: Bridge WebSocket (outbound only)
- **No listening ports**: Pure client
- **Auto-reconnect**: Exponential backoff (1s → 30s max)
- **OpenCode discovery**: Scans common ports, checks config

### Data Flow
1. AI sends MCP tool call → Bridge
2. Bridge validates auth, finds paired Worker
3. Bridge sends work to Worker via WebSocket
4. Worker executes via OpenCode or git
5. Worker returns result to Bridge
6. Bridge returns result to AI

## MCP Tools

| Tool | Risk | Description |
|------|------|-------------|
| `bridge.status` | low | Bridge health + worker count |
| `bridge.capabilities` | low | List available tools |
| `worker.list` | low | List paired workers |
| `worker.status` | low | Worker details |
| `opencode.session.create` | medium | Create coding session |
| `opencode.session.send` | medium | Send coding instruction |
| `opencode.session.stop` | low | Stop session |
| `opencode.session.diff` | low | Get changes diff |
| `repository.status` | low | Git status |
| `repository.diff` | low | Git diff |
| `repository.files` | low | List files |
| `approval.list` | low | List pending approvals |
| `approval.request` | low | Request approval |
| `approval.resolve` | high | Approve/reject |
| `github.status` | low | GitHub PR/commit status |
| `github.review` | high | Review PR (requires approval) |
| `github.pull_request` | critical | Create PR (requires approval) |
| `execution.get` | low | Audit log |

## Security

- All git operations use `execFileSync` (no shell interpolation)
- Input validation via regex patterns
- Repository access is allowlisted
- OAuth 2.1 with PKCE (S256)
- Token-based authentication
- SQLite persistence (survives restarts)
- WebSocket authentication required
- Rate limiting enabled
- Helmet security headers

## Production Deployment

### Environment Variables
```env
BRIDGE_PORT=3000
BRIDGE_AUTH_SECRET=your_secret_here
OPENCODE_BASE_URL=http://127.0.0.1:4096
OPENCODE_SERVER_USERNAME=opencode
OPENCODE_SERVER_PASSWORD=your_password
GITHUB_TOKEN=your_github_token
GITHUB_REPO=owner/repo
ALLOWED_REPOSITORIES=/path/to/repos
WORKER_ID=unique-worker-id
WORKER_TOKEN=worker-auth-token
WORKER_NAME=my-worker
```

### HTTPS (Production)
Use nginx/caddy reverse proxy with TLS termination:
```
Internet → HTTPS → nginx → http://localhost:3000
```

### Docker
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/*/package*.json ./
RUN npm ci
COPY packages/*/dist ./packages/*/dist
EXPOSE 3000
CMD ["node", "packages/bridge/dist/index.js"]
```

## Testing

```bash
# Unit tests
npm test

# Type check all packages
npm run typecheck

# Build all packages
npm run build

# E2E test (requires OpenCode running)
start-all.cmd
```

## Troubleshooting

### Worker won't connect
- Check `BRIDGE_URL` matches Bridge address
- Verify `WORKER_TOKEN` is set
- Check Bridge is running: `curl http://localhost:3000/health`

### OpenCode not found
- Ensure `opencode serve` is running
- Check `OPENCODE_BASE_URL` in .env
- Worker scans ports 4096-4100

### MCP errors
- Check Accept header: must include `application/json` and `text/event-stream`
- Verify session ID in `Mcp-Session-Id` header
- Check auth token in `Authorization: Bearer <token>` header
