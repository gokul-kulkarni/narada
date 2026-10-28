# Narada

Named after Narada Muni, the wandering sage who carries messages between the worlds — as this
app carries your requests to APIs and back.

A free, local-first, Postman-compatible API client (Tauri desktop app). Collections and environments are
plain Postman v2.1 JSON files, stored in a folder you choose and optionally synced to your own
Google Drive. See [STRATEGY.md](STRATEGY.md) for the plan and roadmap.

## Features

- **Requests**: GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS, query params, headers, raw (JSON, text,
  XML, HTML, JS) / x-www-form-urlencoded / form-data bodies, tabs, history. Sent from Rust, so no
  CORS limits and `localhost` works. Cookies persist between requests (shared cookie jar).
- **Auth**: Basic, Bearer, API key (header or query), OAuth 2.0 client credentials with
  "Get new access token"; requests and folders can inherit auth from their folder or collection.
- **Collections**: folders, rename/duplicate/delete, collection variables, auth and scripts,
  Save / ⌘S, import & export in Postman v2.0/v2.1 format.
- **Import from Postman**: pick one or many exported collection/environment files, paste JSON,
  or connect your Postman account with an API key (Postman → Settings → API keys), browse its
  workspaces and import the collections and environments you tick. The key is read-only in use
  and is kept in the OS keychain only if you choose "Remember".
- **Environments & globals**: `{{variable}}` substitution with Postman's precedence
  (local > data > environment > collection > global). Secret variables live in the OS keychain
  and are never written to the synced folder.
- **Scripts**: pre-request and test scripts with a Postman-compatible `pm.*` API (`pm.test`,
  `pm.expect` (chai), `pm.response.to.have.status`, `pm.environment.set`, `pm.request.headers.add`, …),
  with snippets. Collection-level scripts run before the request's own. Scripts run in a Web Worker
  (no DOM, no app bridge) and are stopped after 5 seconds.
- **Runner**: run a collection or folder for N iterations, with a CSV/JSON data file and delay;
  per-request status, time and test results.
- **Code**: generate cURL, JavaScript `fetch` and Python `requests`. Import cURL commands.
- **Google Drive sync**: two-way sync with a `narada` folder in your Drive.

## Data layout

```
<storage folder>/
  Collections/    <id>.postman_collection.json   (Postman Collection v2.1)
  Environments/   <id>.postman_environment.json  (Postman environment)
```

File names come from ids, so renaming never breaks sync. The storage folder defaults to the app's
data directory; change it under **Settings → Storage folder**. History, globals and sync state stay
on the machine (not synced).

## Syncing with Google Drive

Two options:

1. **Zero setup**: install Google Drive for Desktop and pick a folder inside it as the storage
   folder (e.g. `~/Library/CloudStorage/GoogleDrive-<you>/My Drive/narada`). Google syncs it.
2. **Built-in sync** (no Drive for Desktop needed):
   1. In [Google Cloud Console](https://console.cloud.google.com/) create a project, enable the
      **Google Drive API**, configure the OAuth consent screen (External; add yourself as a test user).
   2. Create credentials → **OAuth client ID** → application type **Desktop app**.
   3. In the app: **Settings → Google Drive sync**, paste the client ID and secret, **Save**, then
      **Sign in with Google**. Use **⟳ Sync** in the header to sync.

   The app uses the `drive.file` scope: it can only see files it created, in My Drive →
   `narada/Collections` and `narada/Environments`. (A folder you create by hand in
   Drive is invisible to it; the app creates its own on first sync.)

   Upgrading from the pre-rename build ("Free Postman"): local data, settings and keychain
   secrets move over automatically on first launch. Drive sync now uses a `narada` folder, so
   the first sync uploads your files there; the old `free-postman` Drive folder is left as is.

   Sync rules: the first sync never deletes anything; a deletion on one side only propagates if
   the file wasn't changed on the other; if both sides changed, the Drive version wins and your
   local copy is saved to `<app data>/conflicts/`.

## Development

Requires Node 24+, pnpm, and Rust (stable).

| Command                                        | What it does                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| `pnpm install`                                 | Install dependencies                                                      |
| `pnpm tauri dev`                               | Run the desktop app with hot reload                                       |
| `pnpm tauri build`                             | Build the release app bundle                                              |
| `pnpm dev`                                     | Run the UI in a browser (requests via `fetch`, storage in `localStorage`) |
| `pnpm test` / `pnpm coverage`                  | Unit + integration tests (Vitest), coverage gate at 80%                   |
| `pnpm e2e`                                     | Playwright E2E against the web layer                                      |
| `pnpm test:rust`                               | Rust tests (HTTP, storage, sync planner/engine, OAuth helpers)            |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | ESLint, TypeScript, Prettier                                              |

## Source layout

```
src/lib/          pure logic: request pipeline, auth, variables, Postman converters, curl, codegen,
                  runner, scripts sandbox, storage repository
src/state/        zustand stores (tabs, workspace, history, ui)
src/features/     UI by feature: request, response, collections, environments, scripts, runner, …
src-tauri/src/    http/ (send), storage/ (files, settings), secrets/ (keychain), sync/ (OAuth, Drive, sync engine)
e2e/              Playwright tests
```

## Known limitations

- Saved example responses, folder-level scripts and other Postman fields this app doesn't model
  are dropped when a collection is re-saved.
- Form-data supports text fields only (no file uploads yet); no binary or GraphQL body modes.
- Only these HTTP methods are supported; custom methods are imported as GET.
- OAuth 2.0 supports the client-credentials grant only.
- Scripts can make network calls (`fetch`) from their Worker; only run scripts you trust.
