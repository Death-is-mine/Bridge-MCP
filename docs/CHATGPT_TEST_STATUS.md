# Bridge-MCP ChatGPT Integration Status

## Golden Path: VERIFIED ✅

```
ChatGPT → MCP (HTTPS tunnel) → Bridge-MCP → OpenCode → Local Repo → REAL CHANGE → git diff
```

### All 18 MCP Tools Verified:

| Tool | Status | Notes |
|------|--------|-------|
| `bridge.status` | ✅ PASS | Real bridge + OpenCode health data |
| `bridge.capabilities` | ✅ PASS | Lists all 18 tools |
| `opencode.sessions.list` | ✅ PASS | Lists active sessions |
| `opencode.session.create` | ✅ PASS | Creates real OpenCode session |
| `opencode.session.get` | ✅ PASS | Returns session details |
| `opencode.session.send` | ✅ PASS | AI modifies local files |
| `opencode.session.stop` | ✅ PASS | Stops session |
| `opencode.session.diff` | ✅ PASS | Shows session changes |
| `repository.status` | ✅ PASS | Git status (or fs fallback) |
| `repository.diff` | ✅ PASS | Git diff (or fs fallback) |
| `repository.files` | ✅ PASS | Git ls-files (or fs fallback) |
| `github.status` | ✅ PASS | Real GitHub PRs + commits |
| `github.review` | ✅ PASS | Creates approval request |
| `github.pull_request` | ✅ PASS | Creates PR (requires approval) |
| `bridge.approval.list` | ✅ PASS | Lists pending approvals |
| `bridge.approval.request` | ✅ PASS | Requests approval |
| `bridge.approval.resolve` | ✅ PASS | Approves/rejects |
| `bridge.execution.get` | ✅ PASS | Shows execution history |

### E2E Test Results:

```
1. Bridge → OpenCode health:     opencode.ok: true              ✅
2. MCP initialize:               Session issued, protocol 2025-06-18  ✅
3. MCP tools/list:               All 18 tools returned           ✅
4. bridge.status:                Real data                       ✅
5. opencode.session.create:      Real session in OpenCode        ✅
6. opencode.session.send:        AI modified README.md           ✅
7. repository.status:            Git status "Clean"              ✅
8. repository.diff:              Git diff shows changes          ✅
9. repository.files:             Git ls-files lists files        ✅
10. github.status:               Real GitHub data                ✅
11. OAuth metadata:              Correct public URL              ✅
12. Client registration:         client_id issued                ✅
13. 58 unit tests:               All passing                     ✅
```

### Files modified by AI agent (verified via git diff):

```diff
diff --git a/README.md b/README.md
@@ -2,4 +2,5 @@
 
 This is a test project for Bridge-MCP integration testing.
 Modified by Bridge-MCP E2E test.
+E2E git test passed.
```

## Architecture

```
                    ┌─────────────────────┐
                    │   ChatGPT Client     │
                    └──────────┬──────────┘
                               │ HTTPS (StreamableHTTP MCP)
                               ▼
                    ┌─────────────────────┐
                    │  ngrok / tunnel      │
                    │  (public HTTPS URL)  │
                    └──────────┬──────────┘
                               │ HTTP
                               ▼
┌──────────────────────────────────────────────────────┐
│                  Bridge-MCP (:3000)                   │
│  ┌────────┐  ┌────────┐  ┌──────────┐  ┌──────────┐ │
│  │ OAuth  │  │  MCP   │  │ Sessions │  │Security  │ │
│  │ 2.1    │  │Server  │  │ Manager  │  │ Layer    │ │
│  └────────┘  └────────┘  └──────────┘  └──────────┘ │
└──────────────────────┬───────────────────────────────┘
                       │ HTTP (Basic Auth)
                       ▼
              ┌─────────────────┐
              │  OpenCode Serve  │
              │    (:4096)       │
              └────────┬────────┘
                       │ AI Provider (mimo-v2.5-free)
                       ▼
              ┌─────────────────┐
              │  Local Repository│
              │  (git-tracked)   │
              └─────────────────┘
```

## How to connect ChatGPT

### Quick Start
```bash
start-all.cmd    # Starts everything, shows tunnel URL
```

### Manual Setup
```bash
# 1. Start OpenCode serve (if not running)
start-oc.cmd

# 2. Start Bridge-MCP
start-bridge.cmd

# 3. Start tunnel (for ChatGPT)
start-tunnel.cmd

# 4. Get tunnel URL
type tunnel-url.txt
```

### ChatGPT Configuration
1. Open ChatGPT → Settings → Connectors
2. Add new connector
3. Enter the HTTPS URL from `tunnel-url.txt`
4. ChatGPT auto-discovers OAuth and MCP endpoints

### Tunnel Options
| Tool | Install | Command |
|------|---------|---------|
| ngrok | `choco install ngrok` | `ngrok http 3000` |
| cloudflared | Download from Cloudflare | `cloudflared tunnel --url http://localhost:3000` |
| localtunnel | `npm i -g localtunnel` | `lt --port 3000` |

**Recommendation**: Use ngrok for production (stable URLs, no click-through).

## Environment Variables

```bash
# Required
OPENCODE_BASE_URL=http://127.0.0.1:4096
OPENCODE_SERVER_USERNAME=opencode
OPENCODE_SERVER_PASSWORD=testpass

# Bridge
BRIDGE_PORT=3000
OPENCODE_TIMEOUT_MS=300000

# GitHub (optional)
GITHUB_TOKEN=ghp_...
GITHUB_REPOSITORY=owner/repo

# Production
OAUTH_ISSUER=https://your-public-url.com
BRIDGE_PUBLIC_URL=https://your-public-url.com
```

## Running Tests

```bash
npm test          # 58 tests, all passing
npm run build     # TypeScript compilation
```

## Files Changed

| File | Change |
|------|--------|
| `src/adapter/opencode.ts` | Rewritten: HTTP fetch client with verified API endpoints |
| `src/mcp/server.ts` | Added fs fallback for repository tools (no git required) |
| `src/auth/oauth.ts` | Added request-aware public URL detection |
| `src/api/routes.ts` | Added X-Forwarded-Host support for OAuth metadata |
| `start-bridge.cmd` | Updated with git PATH and env vars |
| `start-tunnel.cmd` | New: HTTPS tunnel launcher |
| `start-all.cmd` | New: Full stack launcher |
| `docs/CHATGPT_TEST_STATUS.md` | New: This file |
