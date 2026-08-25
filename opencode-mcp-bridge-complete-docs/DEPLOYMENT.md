# Deployment

## Local mode

All services run on the developer machine.

## Remote access

Use a secure, authenticated private tunnel.

Never expose:
- OpenCode port directly
- Bridge admin endpoints without auth
- secrets in public frontend

## Production hardening

- HTTPS
- strong auth
- rate limits
- structured logs
- secret manager
- backups
- health checks
