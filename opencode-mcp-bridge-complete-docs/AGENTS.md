# Agent Instructions

You are developing OpenCode MCP Bridge.

## Source of truth

Read this document and every Markdown document in the repository before making architectural changes.

Order:
1. README.md
2. PRODUCT.md
3. PRD.md
4. ARCHITECTURE.md
5. MCP_SPEC.md
6. OPENCODE_INTEGRATION.md
7. SECURITY.md
8. WEB_GUI.md
9. API.md
10. all remaining docs
11. ADRs and workflow documents

Never replace documentation with assumptions.

## Engineering rule

Do not invent a second architecture. Follow the documented contracts.

Before coding:
- inspect existing files
- identify the smallest vertical slice
- preserve working behavior
- make one coherent change at a time

After coding:
- type-check
- lint
- run unit tests
- run integration tests
- run E2E where relevant
- inspect the diff
- update docs if behavior changed

## Safety

Never expose unrestricted terminal execution through a public MCP endpoint.

Destructive actions must have explicit permission and approval.

Never expose OpenCode's local port directly to the public internet.

## Definition of done

A feature is done only when implementation, tests, security, UI state, and documentation agree.
