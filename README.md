# PostZen CLI

Command-line client for the [PostZen](https://postzen.dev) social publishing API. Every command maps directly onto an API endpoint and prints JSON to stdout — built for shell pipelines, cron jobs, CI, and AI agents.

This repo is auto-generated: when the [PostZen OpenAPI spec](https://docs.postzen.dev/api-reference) changes, CI regenerates the commands from `openapi.json` and publishes a new release, so the CLI always matches the current API surface. The same pipeline keeps the [Node](https://github.com/postzen-dev/postzen-node) and [Python](https://github.com/postzen-dev/postzen-python) SDKs and the [MCP server](https://docs.postzen.dev/mcp) in sync.

## Install

```bash
npm install -g @postzen/cli
```

Zero runtime dependencies; requires Node 20+.

## Authenticate

Create an API key on the [API Keys page](https://app.postzen.dev/api-keys), then:

```bash
postzen auth:set --key pzn_live_...   # validates, then saves to ~/.postzen/config.json (0600)
postzen auth:check                    # verify the resolved key
postzen auth:status                   # show the masked key and where it came from
```

`POSTZEN_API_KEY` overrides the saved key (useful in CI); `POSTZEN_API_URL` overrides the base URL.

## Usage

Commands are `group:action` tokens. Path parameters are positional; everything else is a `--flag` using the exact field names from the API. Output is a single compact line of JSON (add `--pretty` to indent). API errors print `{"error":{...}}` to stderr and exit `1`; usage errors exit `2`.

```bash
# Schedule a post
postzen posts:create \
  --content "We just shipped 🚀" \
  --scheduledFor "2026-08-01T09:00:00Z" \
  --platforms '[{"platform":"x","accountId":"acc_123"}]' \
  --tags launch,product

# Pipe into jq
postzen profiles:list | jq '.profiles[].name'

# Explore
postzen help                    # all commands
postzen posts:create --help     # flags, types, and enums for one command
```

## Documentation

Full docs live at [docs.postzen.dev/cli](https://docs.postzen.dev/cli).

## Development

```bash
npm ci
npm run generate   # regenerate src/generated/commands.ts from openapi.json
npm run build      # generate + tsc -> dist/
npm test           # smoke tests against a local mock server
```

`openapi.json` and `src/generated/commands.ts` are synced automatically from the postzen monorepo — don't edit them by hand here.
