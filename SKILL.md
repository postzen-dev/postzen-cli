---
name: postzen
description: Schedule posts, manage profiles, connect social accounts, and upload media across 8 platforms from the CLI
version: 0.1.0
homepage: https://docs.postzen.dev
tags: [social-media, scheduling, publishing, instagram, x, twitter, tiktok, linkedin, facebook, youtube, threads, pinterest]
metadata:
  env:
    - POSTZEN_API_KEY (required) - API key from https://app.postzen.dev/api-keys
    - POSTZEN_API_URL (optional) - Defaults to https://api.postzen.dev
---

# PostZen CLI

Publish and schedule social media posts across X (Twitter), Instagram, TikTok, LinkedIn, Facebook, YouTube, Threads, and Pinterest. Manage profiles (workspaces), connected accounts, and media uploads. Every command is one predictable invocation that prints a single line of JSON — no interactive prompts, safe for tool-calling loops.

## Setup

```bash
npm install -g @postzen/cli
```

Authenticate one of two ways:

```bash
# Persistent: validate and save the key to ~/.postzen/config.json
postzen auth:set --key pzn_live_...

# Ephemeral (CI, agents): environment variable, overrides the saved key
export POSTZEN_API_KEY=pzn_live_...
```

Verify before doing work:

```bash
postzen auth:check    # {"ok":true,"profiles":N} on success
```

## Core Workflow

1. Find the profile (workspace) to act in: `postzen profiles:list`
2. Find target accounts and their ids: `postzen accounts:list --profileId <id> --status connected`
3. (If posting media) upload it first with `postzen media:upload <file>` — see Media Upload Workflow below.
4. Create the post: `postzen posts:create --content ... --platforms '[...]'` with exactly one of `--publishNow`, `--scheduledFor`, or `--isDraft`.
5. Read the JSON response for the created post's id and per-platform status.

## Output Format

- Success: compact single-line JSON on stdout, exit code `0`. Add `--pretty` only when a human will read it.
- API error (non-2xx): `{"error":{"status":<http status>,...}}` on stderr, exit code `1`.
- Usage error (unknown flag, missing argument): human-readable message on stderr, exit code `2`.

Always check the exit code before parsing stdout.

## Commands Reference

Run `postzen <command> --help` to see every flag with its type, required marker, and enum values. Path parameters are positional. Flags use the exact camelCase field names from the API. Scalar array flags accept comma-separated values or repeated flags; structured arrays are passed as JSON strings.

### Authentication

```bash
postzen auth:set --key pzn_live_...   # validate + save key
postzen auth:check                    # verify resolved key
postzen auth:status                   # masked key + source (env var vs config file)
```

### Profiles

Profiles are workspaces that group connected accounts (e.g. one per brand or client).

```bash
postzen profiles:list
postzen profiles:create --name "Acme Marketing" --color "#4caf50"
postzen profiles:get <profileId>
postzen profiles:update <profileId> --name "New name"
postzen profiles:delete <profileId>
```

### Accounts

```bash
postzen accounts:list                                   # all connected accounts
postzen accounts:list --profileId <id> --status connected
postzen accounts:list --platform instagram --page 1 --limit 20
postzen accounts:disconnect <accountId>
```

### Connect (OAuth)

Connecting a new social account is a browser flow — generate the URL and hand it to the user:

```bash
postzen connect:create-url <platform> --profileId <id>   # returns the OAuth URL to open
postzen connect:complete <platform>                       # finish flows that return a code
```

### Media

```bash
postzen media:upload ./photo.jpg
postzen media:upload ./video.mp4 --profileId <id>
```

Uploads the file (presign + PUT in one command) and returns its `publicUrl` to use in a post's `mediaItems`. The content type is inferred from the file extension; pass `--contentType` to override.

### Posts

```bash
postzen posts:create \
  --content "Shared text for all platforms" \
  --platforms '[{"platform":"x","accountId":"acc_123"}]' \
  --publishNow
```

Key flags (see `--help` for all):

- `--platforms` (JSON array, required for non-drafts): `[{"platform":"...","accountId":"...","customContent":"optional per-platform override","settings":{...}}]`. `accountId` accepts a PostZen account id or the provider's account id.
- Exactly one creation mode: `--publishNow`, `--scheduledFor "2026-08-01T09:00:00Z"` (ISO 8601, at least 60 seconds in the future), or `--isDraft`.
- `--mediaItems` (JSON array, max 10): `[{"url":"...","title":"optional alt text"}]`.
- `--tags launch,product` (comma-separated) and `--title` (internal label; YouTube fallback video title).
- `--x-request-id <key>`: idempotency key — retrying with the same value returns the original post instead of creating a duplicate. Use this whenever a create might be retried.

## Media Upload Workflow

```bash
# 1. Upload the file — presigns, PUTs the bytes, and returns the public URL
PUBLIC_URL=$(postzen media:upload ./photo.jpg | jq -r .publicUrl)

# 2. Reference the public URL in the post
postzen posts:create \
  --content "Look at this" \
  --mediaItems "[{\"url\":\"$PUBLIC_URL\"}]" \
  --platforms '[{"platform":"instagram","accountId":"acc_123"}]' \
  --publishNow
```

`media:upload` infers the content type from the file extension (pass `--contentType` to override) and handles files up to 100 MB.

External media URLs also work in `mediaItems` — PostZen downloads and re-hosts them. They must resolve to an image or video of at most 100 MB (PDF is not supported in posts).

## Platform-Specific Examples

Multi-platform post with a per-platform override:

```bash
postzen posts:create \
  --content "We just launched!" \
  --platforms '[
    {"platform":"x","accountId":"acc_x1"},
    {"platform":"linkedin","accountId":"acc_li1","customContent":"We just launched — read the full story on our blog."}
  ]' \
  --publishNow
```

Scheduled Instagram post with media:

```bash
postzen posts:create \
  --content "Behind the scenes 📸" \
  --mediaItems '[{"url":"https://cdn.example.com/bts.jpg"}]' \
  --platforms '[{"platform":"instagram","accountId":"acc_ig1"}]' \
  --scheduledFor "2026-08-01T09:00:00Z" --timezone "America/Los_Angeles"
```

## Supported Platforms

`x` (alias `twitter`), `instagram`, `tiktok`, `linkedin`, `facebook`, `youtube`, `threads`, `pinterest`

## Error Handling

Errors arrive as `{"error":{"status":...}}` on stderr with exit code `1`:

- `400` — validation failed (bad platform value, malformed JSON flag, missing creation mode, `scheduledFor` in the past). The error body says which field; fix and retry.
- `401` — missing or invalid API key. Re-run `postzen auth:check`; ask the user for a valid key from https://app.postzen.dev/api-keys.
- `403` — the key lacks permission (e.g. a read-only key on a write command). Ask the user for a read-write key.
- `5xx` — server side; safe to retry `posts:create` with the same `--x-request-id`.

Exit code `2` means the invocation itself was wrong — read the stderr message and check `postzen <command> --help` before retrying.

## Tips for AI Agents

- Run `postzen auth:check` once before a work session; don't retry other commands to diagnose auth.
- Never invent `accountId` or `profileId` values — always look them up with `accounts:list` / `profiles:list` first and use ids verbatim from the JSON.
- Set exactly one of `--publishNow`, `--scheduledFor`, `--isDraft`. `--scheduledFor` must be ISO 8601 UTC at least 60 seconds ahead; pair with `--timezone` when the user speaks in local time.
- Pass `--x-request-id` with a stable unique value on every `posts:create` so retries are idempotent.
- Quote JSON flag values in single quotes; keep JSON compact and valid — a parse failure is exit code `2` before any API call.
- Prefer omitting `--pretty`; compact output is easier to pipe into `jq` and cheaper to read.
- Connecting a new social account requires a human in a browser (`connect:create-url`); surface the URL rather than trying to complete OAuth yourself.
