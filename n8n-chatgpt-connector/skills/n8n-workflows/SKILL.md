---
name: n8n-workflows
description: Use when the user asks ChatGPT to connect to, inspect, explain, test, or operate workflows exposed by their n8n MCP server.
---

# n8n via MCP

Use the connected n8n MCP server as the source of truth for available tools and workflow schemas.

## Connection and discovery

1. Confirm that the n8n connection is authorized before attempting any operation.
2. Discover the available MCP tools and read their input schemas before calling them.
3. Explain which n8n tool will be used when the action could create, update, activate, deactivate, execute, or delete data.
4. If the server is unavailable or authentication fails, report the exact connection state and ask the user to reconnect or rotate the credential; do not guess endpoints or tokens.

## Safe operation

- Treat workflow definitions, credentials, execution data, contact records, and outbound messaging as user data.
- Prefer read-only inspection first: list workflows, inspect nodes, review execution history, and validate configuration.
- Do not execute a workflow, send a message, modify a workflow, change credentials, activate/deactivate a workflow, or delete data unless the user explicitly requests that action in the current conversation.
- Before a consequential action, summarize the target workflow, operation, inputs, and likely external effects.
- Never expose Bearer tokens, API keys, passwords, webhook secrets, or credential values in responses.
- Do not copy credentials into workflow nodes, files, prompts, or plugin configuration.

## Troubleshooting

When diagnosing a failed n8n operation, collect only the minimum required evidence: tool name, sanitized request shape, HTTP/MCP status, and relevant error message. Redact authorization headers and secret values. Distinguish an authentication failure from a missing tool, invalid workflow input, unavailable n8n instance, or a workflow execution failure.

## User language

Respond in Portuguese when the user writes in Portuguese. Keep n8n tool names and workflow identifiers exactly as returned by the server.
