# Testing

## Unit
- request validation
- permission checks
- OpenCode adapter mapping
- session lifecycle
- error normalization

## Integration
- Bridge ↔ OpenCode
- MCP tool execution
- stream handling
- repository adapter
- GitHub adapter

## Security
- invalid auth
- missing auth
- cross-user session access
- path traversal
- SSRF
- secret leakage
- unauthorized push

## E2E
Test:

AI request → Bridge → OpenCode → change → test → diff → result.
