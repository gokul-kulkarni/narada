# Plan: Agent assist (local agent CLIs + Narada MCP server)

Status (2026-11-23): all phases done (0, 1a, 1b with Claude Code and Codex, 2a, 2b, 2c). The
Gemini CLI adapter is on hold (see below). Every phase was checked end to end with the real
agent against the running app, which found and fixed: a keychain read at startup froze the
window (token now read only when the server is on; keychain commands run off the main thread);
Claude Code gives up on a tool call after about a minute, so an abandoned call is withdrawn and
reported as such; on stateless HTTP the agent is named from its User-Agent; React StrictMode
installed the bridge twice; calls made together queued unseen, so agents are told to make one
change at a time and the dialog counts what waits; a dialog swapping in place could take a click
meant for the previous request, so buttons arm after 500 ms; and a click on the inactive window
only activated it, so Narada now comes to the front when an agent asks.

Agent limits, each checked on a real run (opt-in tests `real_claude*`, `real_codex*`):

- Claude Code 2.1.330: `--tools Read,Grep,Glob`, plan mode, `--restricted`. File tools stay in
  the working folder; no network tools.
- Codex 0.171.0: a custom permissions profile (`:minimal` + working folder, read only) with
  `web_search` disabled, browser/apps/image features disabled and no MCP servers. Commands are
  refused outside the folder ("Operation not permitted") and have no network. Caveats: `:minimal`
  includes the temp folders (denying them breaks the shell); `--sandbox`/`sandbox_mode` must
  never be used (legacy sandbox reads the whole disk and replaces the profile), so Narada refuses
  folders with a `.codex/config.toml`; `exec resume` takes no `-C`, so the process folder is the
  workspace.
- Gemini CLI 0.70.0: on hold. Personal Google sign-in now fails ("This client is no longer
  supported for Gemini Code Assist for individuals", pointing to Antigravity), so it works only
  with a paid `GEMINI_API_KEY`. Found so far: `--approval-mode plan` is silently overridden to
  `default` in untrusted folders unless `--skip-trust` is passed, and personal skills from
  `~/.agents/skills` and `~/.gemini/skills` load even headless. Its stream-json shapes, tool
  limits and `--resume` are still unverified. Covers option 1 (Narada calls the user's agent CLI) and
  option 2 (the user's agent connects to Narada over MCP).

## Goals and non-goals

- Help a user understand and fix a failing request using the coding agent they already
  have (Claude Code, Codex CLI, Gemini CLI), on their own subscription.
- No Narada account, no hosted backend, no API keys held by Narada (Positioning: "Free,
  and your files are yours").
- Off by default. Nothing leaves the machine until the user clicks, and they see what
  will be sent.
- Non-goal: "Sign in with Claude/ChatGPT" inside Narada. Consumer subscription login is
  not available to third-party apps, so we only use CLIs the user has already logged
  into themselves.
- Non-goal (for now): bring-your-own API key, Ollama. Can reuse the same context
  builder later.

## Shared foundation (build first, used by both options)

### F1. Agent context builder — `packages/core/src/assist/`

Pure, protocol-agnostic, fully unit-tested.

- `context.ts`: `buildAgentContext(input): AgentContext` where input is the resolved
  request (`RequestDef`), the delivery shown on the tab (`HttpDelivery | McpDelivery`
  or a transport error string), script/test results, the environment name and the
  variable names in scope.
  - Note: `HistoryEntry` does not keep response bodies, so the source is the active
    tab's last delivery, not history.
- `redact.ts`: `redact(context, secrets): AgentContext`, returning a new object.
  - Removes the values of `Authorization`, `Proxy-Authorization`, `Cookie`,
    `Set-Cookie`, `X-Api-Key` and any header matching `/token|secret|key|auth/i`.
  - Removes auth block credentials (basic, bearer, api key, oauth2 client secret).
  - Replaces every value of an `EnvironmentVariable` with `secret: true` and every
    keychain value wherever it appears (URL, headers, body, response) with
    `{{name}}` / `[redacted]`.
  - Prefers the unresolved request (`{{baseUrl}}/users`) and lists the variable
    names, not their values.
- `truncate.ts`: limits the response body (e.g. 32 KB, head and tail), stream timelines
  and MCP results so a large response doesn't overflow the prompt.
- `prompt.ts`: renders `AgentContext` as Markdown (request, response, tests, the
  question). One template shared by every CLI.
- Tests: secrets never appear in output (property test: random secret values inserted
  into every field), truncation boundaries, HTTP and MCP failure shapes, transport
  error with no response.

### F2. Context preview

A modal (`features/assist/ContextPreview.tsx`) that shows the exact redacted text
before the first send, with a "Don't show again for this computer" setting stored via
`writeLocal`, never the synced folder. This follows Principle 5 ("Be honest about what
happens").

---

## Option 1 — "Ask agent" from Narada (MVP)

### 1.1 Detect agents — Rust `src-tauri/src/assist/detect.rs`

- `assist_detect` command returns
  `[{ id: "claude" | "codex" | "gemini", path, version }]`.
- Reuse the login-shell PATH lookup from `mcp/transport.rs` (`login_path`). Move it to
  a shared `src-tauri/src/shell_env.rs` so both modules use it.
- Run `<cli> --version` with a 5 s timeout; leave out anything that fails.
- Cache the result; re-check when Settings opens or the user clicks "Refresh".

### 1.2 Run an agent — Rust `src-tauri/src/assist/run.rs`

- `assist_run({ agentId, prompt, cwd?, sessionId? }, channel: Channel<AssistEvent>)`
  and `assist_cancel(runId)`, using the same Channel streaming pattern as
  `http::send_request`.
- The prompt goes in on **stdin**, never argv (argv shows up in `ps`).
- An adapter per CLI (a table, not separate branches):

  | Agent       | Command (verify flags against the installed version)                                         | Output parsing                                       |
  | ----------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
  | Claude Code | `claude -p --output-format stream-json --verbose --permission-mode plan` (+ `--resume <id>`) | JSON lines: `assistant` text, `result`, `session_id` |
  | Codex       | `codex exec --json --sandbox read-only -`                                                    | JSON lines events                                    |
  | Gemini      | `gemini -p --output-format stream-json`                                                      | JSON lines; fall back to plain text                  |

- **Read-only by default:** plan mode / read-only sandbox, so the agent explains and
  proposes changes but never edits files or runs commands on its own.
- Optional `cwd`: a "Project folder" setting per collection, so the agent can read the
  server's source code ("why does my API return 422?"). Stored in a local file, not in
  the synced collection.
- Kill the whole process group on cancel, when the window closes, and after a timeout
  (default 5 min).
- Normalise output to
  `AssistEvent = text | suggestion | done{sessionId} | error{message}`.
- Rust tests: adapter parsing from recorded fixture JSON-lines files, plus a fake CLI
  script in `tests/` for spawn, cancel and timeout.

### 1.3 Trust

Reuse the MCP trust model (`@narada/core/mcp/trust`): the first time each agent binary
runs on this computer, ask once and store its fingerprint (path + version) in
`assist-trust.json` via `writeLocal`.

### 1.4 UI — `apps/desktop/src/features/assist/`

- Store: `state/assist-store.ts` (Zustand, immutable updates). It holds runs per tab:
  `{ status, agentId, text, sessionId, suggestion }`.
- Entry points:
  - An "Ask <agent>" button in `ResponseViewer` and `McpResult` when the delivery is
    `err` (not delivered, 4xx/5xx, `isError`, failed tests). It is also in the command
    palette ("Ask agent about this response") with a shortcut.
  - A split button picks the agent when more than one is detected. The last choice is
    remembered.
- `AssistPanel.tsx`: a dock below or beside the response that streams Markdown, with
  Stop, a follow-up input (uses `--resume`/session) and "Copy".
- Suggested fixes: the prompt asks the agent to end with a fenced `narada-patch`
  JSON block (a partial `HttpRequestDef`: url, headers, body, auth type, but never
  secret values). Narada parses and validates it with the core schema and shows a
  **diff**. "Apply to tab" changes only the unsaved tab; saving is the user's normal
  save. If the patch is invalid, show the text only.
- Settings → "Agents": detected agents, refresh, default agent, project folder,
  preview toggle and the context size limit.

### 1.5 Tests (TDD, 80%+)

- Core: everything in F1, plus parsing and validation of `narada-patch`.
- Desktop unit: assist store reducers, button visibility rules, the diff/apply flow
  with a mocked `assist_run`.
- Rust: adapters, spawn/cancel/timeout using a fake CLI.
- E2E (Playwright, browser build with a stubbed Tauri invoke): failing request →
  Ask → streamed answer → apply patch → resend succeeds.

### 1.6 Browser build

`pnpm dev` in a plain browser cannot run processes. Hide the feature there (the
capability flag comes from `defaultStores()`-style detection).

---

## Option 2 — Narada as an MCP server

Lets Claude Code, Cursor, Codex or any other MCP client read and use Narada while it
works in the user's codebase.

### 2.1 Transport and security

- Streamable HTTP served by the running app on `127.0.0.1` only, port 6277 by default
  (configurable), path `/mcp`.
- Off by default. Turning it on creates a random bearer token kept in the **keychain**
  (`secrets::secret_set`). Every request needs the token.
- Reject requests whose `Host` or `Origin` header isn't loopback (protects against DNS
  rebinding).
- Rust: promote `rmcp` features `server` + `transport-streamable-http-server` from
  dev-deps to deps. New module `src-tauri/src/mcp_server/`.
- Settings → "MCP server": on/off, port, regenerate token, and copy-paste setup
  snippets:
  - `claude mcp add --transport http narada http://127.0.0.1:6277/mcp --header "Authorization: Bearer <token>"`
  - `mcpServers` JSON for Cursor / Claude Desktop, and the Codex `config.toml` block.
- A status indicator in the shell while a client is connected, plus a log of every
  tool call in the delivery log style (Principle 5).

### 2.2 Bridge to the webview

Requests, environments, variable resolution, `pm.*` scripts and tab state live in the
React app. So the Rust MCP handler forwards each tool call to the webview:

- Rust emits `assist://tool-call {callId, name, args}` and waits on a oneshot (30 s
  timeout).
- The webview (`features/assist/mcp-bridge.ts`) runs the call through the stores and
  replies with `assist_tool_result(callId, result)`.
- If no window is open, return a clear MCP error ("Open Narada to use this tool").

### 2.3 Tools

Every result passes through F1 `redact` + `truncate`.

Read-only (no prompt):

| Tool                | Returns                                                             |
| ------------------- | ------------------------------------------------------------------- |
| `list_collections`  | Collections tree: names, ids, method + url per request              |
| `get_request`       | A saved request or open tab, unresolved, with variable names        |
| `list_environments` | Names + variable **names** (secret ones flagged, values never sent) |
| `get_last_delivery` | Active tab's last request + redacted response + test results        |
| `list_history`      | Recent deliveries: method, url, status, time                        |

Actions (each asks for approval in Narada, with "Allow for this session"):

| Tool                | Effect                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `send_request`      | Sends a saved request or an ad-hoc `RequestDef` with the chosen environment, then returns the redacted delivery. Logged in history as sent by the agent |
| `update_request`    | Proposes a patch to a saved request. Narada shows a diff, and the user accepts before anything is written to the synced folder                          |
| `create_request`    | Adds one or more requests to a collection or folder (see 2.4)                                                                                           |
| `create_collection` | Creates a new, empty collection file, optionally with collection variables (names + non-secret values)                                                  |
| `create_folder`     | Adds a folder (optionally nested) to a collection                                                                                                       |

- Resource: `narada://delivery/latest` (same content as `get_last_delivery`).
- Prompts:
  - `debug_failing_request`, which pre-fills the agent with the latest failure.
  - `requests_from_code`, which tells the agent to read the routes in the current
    project and call `create_request` for each one, grouped by folder.

### 2.4 Creating requests from Claude Code

The main use cases are:

- "Add a request for the endpoint I just wrote."
- "Make a collection for every route in `src/routes/`."
- "Turn this cURL / these OpenAPI paths into requests."

`create_request` input (validated with the core schema; invalid input returns an MCP
error explaining which field is wrong, so the agent can retry):

```jsonc
{
  "collection": "Orders API", // name or id; the user is asked if it doesn't exist
  "folder": "orders/admin", // optional path; missing folders are created
  "requests": [
    // 1–50 per call
    {
      "name": "Create order",
      "protocol": "http", // or "mcp" with server + operation
      "method": "POST",
      "url": "{{baseUrl}}/orders",
      "headers": [{ "key": "Content-Type", "value": "application/json" }],
      "body": { "mode": "raw", "language": "json", "raw": "{ \"sku\": \"abc\" }" },
      "auth": { "type": "inherit" }, // never literal secrets; use {{variables}}
      "description": "From src/routes/orders.ts:42",
    },
  ],
}
```

Rules:

- **Additive only.** It never overwrites or renames existing items. A name that
  already exists in the same folder becomes "Create order (2)", and the result says so.
- **No secrets in files.** If an auth or header value looks like a literal secret (a
  bearer token, a `sk-…` key, a long base64 string), Narada swaps it for a
  `{{variable}}` placeholder and reports the variable names the user needs to fill in.
  Collections are synced, so a secret written here could end up in Drive.
- **Variables:** variables like `{{baseUrl}}` that aren't defined in any scope are
  listed in the result (`missingVariables`). The agent can then propose them; they
  are never created silently.
- **Approval:** one dialog per call, not per request. It shows a tree preview of
  everything that will be added (folders + method/name/url) and offers Add, Cancel,
  or "Allow creating for this session". Creating is lower risk than editing, so the
  session allowance is reasonable here. It is never offered for `update_request`.
- **After writing:** the file is saved in Postman v2.1 format through the normal
  `write_document` path, so Drive sync and teammates' copies behave as usual. The
  sidebar reveals the new items, and the first one opens in a tab.
- **Result to the agent:** the ids and names created, the folder path, any renames,
  `missingVariables` and replaced secrets. That's enough for a follow-up
  `send_request` to try the new request straight away.

Tests: schema validation errors, duplicate-name renaming, folder auto-creation,
secret-to-placeholder replacement, 50-item limit, approval approve/deny/session, and
an E2E test where an rmcp test client creates 3 requests in a new folder and the
written file opens unchanged in the Postman v2.1 schema validator.

### 2.5 Tests

- Core: tool argument schemas, redaction of every tool's output.
- Rust: spin up the server on an ephemeral port with an in-test rmcp client (already a
  dev-dep). Covers token rejection, Origin/Host rejection, tool listing, and bridge
  timeout with a stub bridge.
- Desktop: the bridge handlers against memory stores, and the approval dialog
  (approve / deny / session).
- E2E: enable the server → connect via the rmcp test client → `get_last_delivery`
  returns redacted data → `update_request` shows a diff → accept → file written.

---

## Phasing

| Phase | Scope                                                                                                         | Done when                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 0     | F1 context + redaction in core                                                                                | Property tests prove no secrets appear in output                 |
| 1a    | Detect + run Claude Code only, read-only, AssistPanel, preview                                                | Ask on a failing request streams an answer                       |
| 1b    | Codex + Gemini adapters, follow-ups, `narada-patch` diff/apply, project folder                                | Fix applied to the tab, resend passes                            |
| 2a    | MCP server with read-only tools, token, settings snippets                                                     | Claude Code reads the last failure via MCP                       |
| 2b    | `create_request` / `create_folder` / `create_collection` + tree-preview approval, `requests_from_code` prompt | "Make requests for my routes" in Claude Code adds them to Narada |
| 2c    | `send_request`, `update_request` with diff approval, activity log                                             | Agent fixes and re-sends a request, with the user approving      |

Docs: README "Agent assist" section, plus PRODUCT.md capability and known-gaps
updates in each phase.

## Risks and open questions

- **CLI flag churn:** agent CLIs change their flags and output formats. Keep the
  adapters data-driven, test them against recorded fixtures, and show the raw stderr
  when parsing fails.
- **Prompt injection from responses:** a response body is untrusted text sent to the agent.
  So Claude Code gets only Read, Grep and Glob (`--tools`): no WebSearch, WebFetch or
  commands, so it has no way to send data off the machine. Keep any new agent to the same rule.
- **Redaction is best-effort** for secrets that aren't marked (e.g. a token pasted
  straight into a body). The preview modal is the backstop, and the docs should say so.
- **Port conflicts / multiple windows** for the MCP server: fall back to "port in
  use", and allow only one server per app instance.
- **Orca plugin:** it has no Tauri, so option 1 doesn't apply. Option 2 could later run
  inside the plugin worker; out of scope here.
- Open: should `send_request` from an agent be allowed to hit non-localhost hosts
  without asking? Proposal: always ask the first time per host.
