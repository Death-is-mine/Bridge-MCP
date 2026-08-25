# Authentication

## Goals

- authenticate bridge users
- authenticate OpenCode connection
- authenticate remote MCP clients
- never leak secrets

## Local mode

The first local-only version can use a pairing secret stored outside source control.

## Remote mode

Use short-lived credentials or a secure tunnel with explicit authentication.

## Browser

Never put OpenCode server passwords into frontend JavaScript.
