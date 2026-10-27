# free-postman

A free, local-first Postman alternative (Tauri desktop app) that stores and syncs data in the
user's own Google Drive. See [STRATEGY.md](STRATEGY.md) for the full plan and roadmap.

## Data layout

```
free-postman/
  Collections/    <name>.postman_collection.json   (Postman Collection v2.1 format)
  Environments/   <name>.postman_environment.json  (Postman environment format)
```

The same layout exists in Google Drive:
https://drive.google.com/drive/folders/1mDo1XwJV93Ozq4T9tbLb1HartlsJ5NVC

Secret and "current" variable values are never written to these folders; they stay in the
OS keychain.

## Development

Requires Node 24+, pnpm, and Rust (stable).

| Command                                        | What it does                              |
| ---------------------------------------------- | ----------------------------------------- |
| `pnpm install`                                 | Install dependencies                      |
| `pnpm tauri dev`                               | Run the desktop app with hot reload       |
| `pnpm tauri build`                             | Build the release app bundle              |
| `pnpm test` / `pnpm coverage`                  | Unit tests (Vitest), coverage gate at 80% |
| `pnpm e2e`                                     | Playwright E2E against the web layer      |
| `pnpm test:rust`                               | Rust tests                                |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | ESLint, TypeScript, Prettier              |

## Source layout

```
src/            React UI (features/ per domain, lib/ for pure logic)
src-tauri/      Rust shell: HTTP sending, storage, Drive sync, keychain (added per phase)
e2e/            Playwright tests
```
