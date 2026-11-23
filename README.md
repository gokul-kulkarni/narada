# Narada

Named after Narada Muni, the wandering sage who carries messages between the worlds — as this
app carries your requests to APIs and back.

A free, local-first, Postman-compatible API client (Tauri desktop app). Collections and environments are
plain Postman v2.1 JSON files, stored in a folder you choose and optionally synced to your own
Google Drive. See [STRATEGY.md](STRATEGY.md) for the plan and roadmap.

## Install

Download the installer for your computer from the
[latest release](https://github.com/gokul-kulkarni/narada/releases/latest):

| Computer            | File                                                    |
| ------------------- | ------------------------------------------------------- |
| Mac with Apple chip | `Narada_<version>_aarch64.dmg`                          |
| Mac with Intel chip | `Narada_<version>_x64.dmg`                              |
| Windows             | `Narada_<version>_x64-setup.exe` (or the `.msi`)        |
| Linux               | `.AppImage`, `.deb` (Debian, Ubuntu) or `.rpm` (Fedora) |

**macOS:** the easiest way is Homebrew, which also gets past the warning below:

```sh
brew trust gokul-kulkarni/tap
brew install --cask gokul-kulkarni/tap/narada
```

Or open the `.dmg` and drag Narada to Applications. The app isn't notarized by Apple yet, so
macOS says it "is damaged and can't be opened" (older versions say it can't check it for
malware). The app is fine: remove the download flag once in Terminal, then open it:

```sh
xattr -dr com.apple.quarantine /Applications/Narada.app
```

**Windows:** SmartScreen may say it protected your PC, because the installer isn't signed yet:
choose **More info → Run anyway**.

To build it yourself instead, see [Development](#development).

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
- **Streaming**: responses appear as they arrive, with a Stop button. Server-sent events and JSON
  lines get an Events view with arrival times; LLM streams (OpenAI-compatible, Anthropic, Ollama,
  Gemini) also get the joined Text with time to first text.
- **MCP client**: save MCP servers (a local command over stdio, or a remote Streamable HTTP URL),
  connect, browse their tools, resources and prompts, and call them from request tabs with a form
  built from each tool's input schema. Results land in the delivery log and history like HTTP
  requests, and MCP requests save into collections. Import servers by pasting the `mcpServers`
  config used by Claude Desktop, Cursor and others. A local command must be confirmed on each
  computer before it first runs (and again if it changes), since server files can arrive by sync.
- **Ask an agent**: when a request fails (not delivered, 4xx/5xx, an MCP tool error or a failed
  test), "Ask Claude Code" (or Codex) sends a description of the request and response to the
  agent you already have installed and signed in to, and shows its answer beside the response.
  Narada holds no AI account or key. Secret variables, credential headers, auth values and tokens
  are replaced with `[redacted]` first, and the first time you see exactly what will be sent.
  The agent runs read-only with no network:
  - **Claude Code** gets only its Read, Grep and Glob tools, in plan mode with `--restricted`.
  - **Codex** runs in a permissions profile that may read only the project folder (and the
    system and temp folders a shell needs), with network, web search, browser, apps and MCP
    servers off.

  When it suggests a fix (method, URL, headers or body; never auth), you see it as a diff and
  "Apply to tab" changes only the open tab, ready to dispatch and save. Ask follow-up questions
  in the same conversation. To let it read the code behind an API, choose a project folder (per
  collection, or a default) in Settings → Agents, where you also pick the agent: it can read
  only that folder, and Narada refuses the disk root and your home folder. Without one it sees
  only what it was told. Folders stay on this computer.

- **MCP server for coding agents**: turn it on in Settings → MCP server and Claude Code, Codex,
  Cursor or any MCP client can work with Narada while it works on the code behind your API. It can
  read your collections, a saved request, your environments (variable names only), recent history
  and the open tab's latest response, always with secrets removed. It can also, each only after
  you approve in Narada: add requests, folders and collections (for example one per route it
  finds, via the `requests_from_code` prompt; existing requests never change), change a saved
  request's method, URL, headers or body (you see the exact diff; never auth), and send a saved or
  one-off request exactly as Dispatch would (you see where it goes; you can allow a host for the
  session). Literal credentials it writes become `{{variables}}`. Narada comes to the front when
  it asks, since agents wait only about a minute; one that gives up has its request withdrawn. It
  listens only on `127.0.0.1` (port 7377 by default), needs a token kept in your keychain,
  refuses requests from web pages, and is off until you turn it on. Settings shows the one-line
  setup for each agent and recent activity.
- **Keyboard**: the shortcuts you know from VS Code and browsers. ⌘P goes to any saved request,
  ⌘⇧P lists every command, ⌘↵ sends, ⌘T / ⌘W / ⌘⇧T open, close and reopen tabs, ⌃Tab and ⌘1–9
  switch tabs, ⌘L jumps to the URL, ⌘B hides the sidebar, ⌘J opens History, ⌘, opens Settings (Ctrl on Windows and
  Linux). Settings lists them all.
- **Code**: generate cURL, JavaScript `fetch` and Python `requests`. Import cURL commands.
- **Google Drive sync**: two-way sync with a `narada` folder in your Drive.
- **HTTPS certificates**: trust extra certificate authorities from a PEM file (a company proxy's
  root, a dev server's self-signed certificate), or turn certificate checks off, in Settings.

## Data layout

```
<storage folder>/
  Collections/    <id>.postman_collection.json   (Postman Collection v2.1)
  Environments/   <id>.postman_environment.json  (Postman environment)
  MCP/            <id>.mcp.json                  (MCP server: command or URL)
```

MCP requests are stored in collections as ordinary items with a placeholder request (so Postman
still opens the file) and the MCP details under a `narada` field.

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

## Orca plugin

Narada also runs as a panel in [Orca](https://www.onorca.dev)'s sidebar, sending your saved
requests with the same logic as the app. Install it from Orca's plugin directory or with
`orca plugin install gokul-kulkarni/narada-orca`;
see [apps/orca-plugin/README.md](apps/orca-plugin/README.md).

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
| `pnpm check`                                   | Typecheck, lint and test every project (Nx, cached)                       |

## Source layout

A pnpm workspace run with [Nx](https://nx.dev): shared logic lives in one package and each client
is an app beside it. `pnpm check` runs typecheck, lint and tests for every project.

```
packages/core/            @narada/core: logic every client shares, with no Tauri, React or browser
  src/                    globals: model, Postman converters, variables, auth, request preparation,
                          fetch transport, streaming, curl, codegen, MCP helpers, storage ports
apps/orca-plugin/         Narada as an Orca sidebar panel (see apps/orca-plugin/README.md)
apps/desktop/             the Tauri desktop app
  src/lib/                desktop adapters (Tauri send, keychain/file stores, Drive, dialogs),
                          scripts sandbox (Web Worker) and runner
  src/protocols/          one module per protocol (http/, mcp/) plus registry.tsx, which the generic
                          UI (tabs, history, delivery log) asks instead of reading protocol fields
  src/state/              zustand stores (tabs, workspace, history, ui, mcp)
  src/features/           UI by feature: request, response, collections, environments, runner, …
  src-tauri/src/          http/ (streaming send), mcp/ (MCP client via rmcp), storage/ (files,
                          settings), secrets/ (keychain), sync/ (OAuth, Drive, sync engine)
  e2e/                    Playwright tests
```

## Known limitations

- Saved example responses, folder-level scripts and other Postman fields this app doesn't model
  are dropped when a collection is re-saved.
- Form-data supports text fields only (no file uploads yet); no binary or GraphQL body modes.
- Only these HTTP methods are supported; custom methods are imported as GET.
- OAuth 2.0 supports the client-credentials grant only.
- Scripts can make network calls (`fetch`) from their Worker; only run scripts you trust.
- Asking an agent: Claude Code and Codex only (Gemini CLI not yet), and only in the desktop app.
  Redaction is best-effort: a token pasted into a body as plain text, with no telling name, may
  not be caught, which is what the preview is for. Codex answers arrive whole rather than word by
  word, can also read the temp folders, and is refused in a project folder with its own
  `.codex/config.toml` (whose settings could loosen the limits).
- MCP: no OAuth sign-in for remote servers yet (use a header token), no sampling, roots or
  elicitation, and the collection runner skips MCP requests. The browser build (`pnpm dev`)
  supports remote servers only, and only those that allow CORS.

## License

MIT. See [LICENSE](LICENSE).
