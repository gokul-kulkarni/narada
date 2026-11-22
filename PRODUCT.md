# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Delivered as a Tauri 2 desktop app whose UI is a React web view; `pnpm dev` also runs the UI in a plain browser. The design language is web, not native macOS/Windows.)

## Users

- **Developers leaving Postman.** Backend and full-stack developers who rely on Postman's core features (collections, environments, scripts, runner) and do not want to pay for sync, collaboration or run limits. They arrive with existing Postman exports or a Postman account and expect their work to carry over unchanged.
- **AI/LLM builders.** Developers who spend their day hitting LLM endpoints (OpenAI-compatible, Anthropic, Ollama, Gemini) and MCP servers, and need to see streams as they arrive and call MCP tools without writing a client.
- **Organizations.** Teams and companies that want a shared, free API client, sharing collections through files and their own Google Drive instead of a paid hosted workspace.

## Product Purpose

Narada is a free, local-first, Postman-compatible API client. It sends HTTP and MCP requests, organises them into collections and environments, runs scripts and collections, and stores everything as plain Postman v2.1 JSON in a folder the user picks, optionally synced to their own Google Drive. Success means a Postman user can import their work, use it daily without hitting a paywall, and leave at any time with their files intact.

Named after Narada Muni, the wandering sage who carries messages between the worlds, as the app carries requests to APIs and back.

## Positioning

**Free, and your files are yours.** No account, no backend, no hosting, no paywall: collections and environments are ordinary Postman-format files on the user's disk or in their own Drive. When this conflicts with other goals (feature parity, protocol breadth), this wins. Postman compatibility and modern-protocol support (streaming, LLM, MCP, later GraphQL) serve this claim; they do not override it.

## Operating Context

- A desktop tool open all day beside an editor and terminal; used in repeated short loops: edit request, send, read response, adjust.
- Works against `localhost` and internal services as well as public APIs (requests are sent from Rust, so no CORS limits).
- Files live in a user-chosen folder (`Collections/`, `Environments/`), often a Google Drive for Desktop folder or synced via the in-app Drive sync; teammates may change files underneath the app.
- Imports come from Postman exports, pasted JSON, cURL, a Postman account via API key, and `mcpServers` configs from Claude Desktop, Cursor and similar.
- The "delivery log" is the app's record of what was sent and what came back, shared across protocols.

## Capabilities and Constraints

- **Requests:** HTTP methods GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS; params, headers, raw / urlencoded / form-data bodies; tabs; history; shared cookie jar; live streaming with Stop, SSE/JSON-lines Events view, joined LLM text with time to first text.
- **MCP client:** stdio and Streamable HTTP servers; browse and call tools, resources and prompts; schema-built forms; MCP requests save into collections. A local command must be confirmed per computer before it first runs.
- **Auth:** Basic, Bearer, API key, OAuth 2.0 client credentials; inheritance from folder/collection.
- **Variables:** `{{variable}}` with Postman precedence (local > data > environment > collection > global).
- **Scripts:** Postman-compatible `pm.*` pre-request and test scripts in a Web Worker, 5-second limit.
- **Runner, code generation, import/export** in Postman v2.0/v2.1.
- **Architecture constraint:** protocols are modules (`src/protocols/<id>/`) behind a registry; tabs, history and the delivery log must stay protocol-agnostic. GraphQL is planned next; WebSocket possibly later.
- **Data constraint:** stored files must stay Postman v2.1-compatible; Narada-only data goes in a `narada` extension field. All file and import content is untrusted and schema-validated.
- **Security constraint:** secret variables and remembered keys live in the OS keychain and are never written to the synced folder.
- **Known gaps (do not imply otherwise):** no file uploads in form-data, no binary or GraphQL bodies yet, OAuth 2.0 client credentials only, no MCP OAuth/sampling/roots/elicitation, runner skips MCP requests, browser build supports only CORS-enabled remote MCP servers.

## Brand Commitments

- Name: **Narada**, with the Narada Muni messenger story as its origin.
- Voice: plain and specific, as in the README (says exactly what happens, states limits openly).
- Open source under MIT.

## Evidence on Hand

- README.md (features, limitations), STRATEGY.md (origin and roadmap), LICENSE.
- Sample data folders: `Collections/`, `Environments/`.
- No users, testimonials, download counts, benchmarks or press yet. Future work must not invent them.

## Product Principles

1. **The user's files are the product's memory.** Never lock data into a format, account or server; anything Narada saves must open in Postman.
2. **Free means no hidden ceiling.** No feature is held back behind sign-in, limits or a hosted tier.
3. **Postman users should feel at home on day one.** Imports, `pm.*` scripts, variables and runner behave the way they already expect.
4. **Every protocol is first-class.** HTTP, MCP and future protocols share tabs, history and the delivery log rather than being bolted on.
5. **Be honest about what happens.** Show what was actually sent and received, say what is unsupported, and ask before anything risky (running local commands, overwriting synced files).

## Accessibility & Inclusion

Public open-source release: meet WCAG 2.2 AA. Full keyboard operation of the core send loop, sufficient contrast in both light and dark themes, and respect for reduced-motion preferences.
