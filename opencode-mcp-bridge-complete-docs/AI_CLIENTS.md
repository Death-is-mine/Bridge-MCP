# AI Clients

The Bridge is AI-provider agnostic.

Any client that supports the MCP transport and tool-calling model can use the Bridge, subject to the client's MCP capability and permission model.

## Examples

- ChatGPT
- Claude
- other MCP-capable assistants
- custom agent applications

The Bridge must not assume:
- a specific model
- a specific vendor
- a specific conversation format

## Client registry

Store:
- display name
- client type
- MCP endpoint/profile
- auth method
- connection state
- last activity

Never store provider secrets in plaintext.
