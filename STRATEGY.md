# Free Postman Alternative — Strategy & Phase 0 Plan

## Context

You want a free, Postman-like API client. Postman's paywalls are mostly around sync,
collaboration and run limits, so the core idea is: **local-first desktop app, with the
user's own Google Drive as free cloud storage/sync** (no backend server, no hosting cost).
Decisions made: Tauri desktop app; Drive is the app's storage/sync; create the Drive
folder structure both via the Drive API and locally.

The project dir `/Users/gokulkulkarni/MyDrive/ideas/ai/free-postman` is empty (greenfield).
Note: `/Users/gokulkulkarni/MyDrive` is a plain folder, not the Google Drive for Desktop
mount (that lives at `~/Library/CloudStorage/GoogleDrive-gokul.cs5@gmail.com/`), so the
local copy only syncs if that folder is backed up by Drive for Desktop.

## Step 1 — Create the folders (first thing after approval)

Name: `free-postman`, each containing `Collections/` and `Environments/`.

1. **Google Drive** (via `mcp__claude_ai_Google_Drive__create_file`, mimeType
   `application/vnd.google-apps.folder`): `free-postman` in My Drive root, then the two
   subfolders with `free-postman` as parent. Search first so I don't make duplicates.
2. **Local**: `mkdir -p .../free-postman/{Collections,Environments}` in the working dir.
3. Add a `README.md` in the project describing the layout below.

## How Postman works (what we're cloning)

| Concept         | What it is                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| Workspace       | Top-level container of collections/environments                                                                       |
| Collection      | Tree of folders + requests; has its own auth, variables, pre-request/test scripts                                     |
| Request         | Method, URL, query params, headers, body (none / form-data / urlencoded / raw JSON-XML-text / binary / GraphQL), auth |
| Auth            | None, Basic, Bearer, API Key, OAuth 2.0 (later: Digest, AWS SigV4) — inherits from folder/collection                  |
| Variables       | `{{name}}` substitution; scope precedence: local > data > environment > collection > global                           |
| Environment     | Named set of variables (dev/staging/prod), with "initial" (shared) vs "current" (local) values and secret type        |
| Scripts         | JS run before request / after response via the `pm.*` API (`pm.environment.set`, `pm.test`, `pm.expect`)              |
| Response viewer | Status, time, size, headers, cookies, pretty/raw/preview body                                                         |
| History         | Log of every sent request                                                                                             |
| Runner          | Run a collection in order, optionally with CSV/JSON data, see test results                                            |
| Import/Export   | Postman Collection v2.1 JSON, environment JSON, cURL, OpenAPI                                                         |
| Code gen        | Turn a request into cURL/fetch/Python/etc.                                                                            |

## Architecture

- **Shell**: Tauri 2 (Rust). HTTP requests are sent from Rust (`reqwest`) — no CORS,
  can hit `localhost`, full control of headers/cookies/TLS/timing.
- **UI**: React + TypeScript + Vite, Zustand for state, Monaco editor for bodies/scripts,
  Tailwind + shadcn/ui.
- **Storage (local-first)**: files on disk are the source of truth, in the same layout
  as Drive:
  ```
  free-postman/
    Collections/<collection-name>.postman_collection.json   (Postman v2.1 schema)
    Environments/<env-name>.postman_environment.json
  ```
  Using Postman's own formats means import/export is free and users can migrate easily.
- **Secrets**: "current" values and secret-type variables are never written to Drive;
  stored in the OS keychain (`tauri-plugin-stronghold` or `keyring` crate).
- **Drive sync** (Phase 3): Google OAuth desktop flow (loopback redirect + PKCE), scope
  `drive.file` (non-sensitive, no Google security audit). Push on save, pull on launch /
  focus, conflict detection via Drive `modifiedTime` + local hash; on conflict keep both
  and let the user pick.
  - Caveat: with `drive.file` the app can only see files it created. So the app will
    "find-or-create" its own `free-postman` folder; the folder we create in Step 1 is
    the reference layout and can be adopted by the app via a one-time Google Picker
    selection, or by just using Drive for Desktop's synced folder as the storage path.
  - Zero-OAuth shortcut available from day one: point the app's storage path at the
    Drive for Desktop folder and Google syncs it for free.
- **Scripting** (Phase 4): run `pm.*` scripts in a sandboxed JS runtime (QuickJS via
  `rquickjs` in Rust, or a sandboxed iframe/Web Worker), with `chai` for assertions.

## Status (2026-10-27)

Phases 0–4 are implemented; see README.md for features and known limitations.

## Phased roadmap

- **Phase 0 – Setup**: folders (Step 1), scaffold Tauri + React + TS, lint/test tooling
  (Vitest, Playwright for E2E, `cargo test`), git init.
- **Phase 1 – MVP request client**: request builder (method, URL, params, headers, body,
  basic/bearer/API-key auth), Rust HTTP send, response viewer, tabs, history.
- **Phase 2 – Collections & Environments**: sidebar tree, CRUD folders/requests, save to
  `Collections/`; environment editor + switcher, `{{var}}` resolution with scope
  precedence; import/export Postman v2.1 + cURL.
- **Phase 3 – Google Drive sync**: sign-in, find-or-create folder, two-way sync, conflict
  UI, keychain for secrets.
- **Phase 4 – Power features**: pre-request/test scripts, collection runner with data
  files, OAuth 2.0 auth, code generation, cookies manager.
- **Later**: share collections (Drive sharing = free collaboration), OpenAPI import,
  GraphQL/WebSocket/gRPC, mock server, CLI runner (like Newman) for CI, AI request
  generation.

## Proposed source layout (Phase 0)

```
src-tauri/src/{http/, storage/, sync/, secrets/}   # Rust: send, file IO, Drive, keychain
src/features/{request, response, collections, environments, history}/
src/lib/{variables.ts, postman-schema.ts, curl.ts}
```

Small files per feature; immutable state updates; schema validation (zod) on every
file read/import since Drive content is untrusted.

## Verification

- Step 1: `search_files` in Drive shows `free-postman` with exactly `Collections` and
  `Environments` as children; `ls` shows the local folders.
- Phase 1+: unit tests for variable resolution and Postman schema parse/serialize,
  Rust tests for the HTTP layer against a local test server, Playwright E2E for
  "create request → send → see response → save to collection"; import a real Postman
  export and round-trip it unchanged.
