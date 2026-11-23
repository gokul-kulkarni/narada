# Narada for Orca

Send your saved [Narada](https://github.com/gokul-kulkarni/narada) requests from Orca's right
sidebar. Pick a request from your collections, choose an environment, adjust the method, URL,
query parameters, headers or raw body, and read the status, timing, headers and body of the reply.
Paste a cURL command to save it as a new request in a collection.

It uses the same logic as the Narada desktop app (`@narada/core`): Postman v2.1 collections,
`{{variable}}` resolution with Postman's precedence (environment > collection > global), and
Basic, Bearer, API-key and OAuth 2.0 token auth inherited from folders and the collection.

## Install

From Orca's plugin directory (search for Narada), or from the terminal:

```sh
orca plugin install gokul-kulkarni/narada-orca   # Orca shows the access it asks for, then installs
```

Then open the **Narada** panel from Orca's right sidebar.

## What it reads

- **Collections and environments** from the folder the Narada app uses (the one chosen in Narada,
  else its default), or the folder set in Settings → Plugins → Narada → _Collections folder_.
  The one thing it writes is a new request from cURL, added to the collection file you pick.
  Editing and deleting stay in the Narada app. Narada reads its files when it starts: if it is
  open when you add a request here, restart it before editing that collection there, or it will
  save over the new request.
- **Globals** from the Narada app's local `globals.json`.
- **Secret variables**: Narada keeps them in the OS keychain, which the plugin can't read. The
  panel asks for any it needs and keeps them in the plugin's encrypted secrets.

## HTTPS certificates

Requests to a server whose certificate isn't signed by an authority your computer trusts fail with
an error such as "self signed certificate in certificate chain". That happens with a dev server's
self-signed certificate, or on a network whose proxy re-signs HTTPS. In Settings → Plugins → Narada:

- **Extra CA certificates**: a PEM file of authorities to trust as well as the usual ones (your
  company's root certificate, or the dev server's own). Certificates are still checked.
- **Verify TLS certificates**: turn off to accept any certificate. Use it only for servers you trust.

## Not in this version

Pre-request and test scripts (they run only in the app's sandbox), MCP requests, editing form
bodies, streamed responses shown as they arrive, and history. Bodies over 400 KB are cut.

## Access it asks for

A Node.js worker process (`trusted-worker`) that reads the collections folder, adds requests you
create from cURL to collection files, and sends the HTTP requests, the plugin's own settings (`settings:own`) and its own encrypted secrets
(`secrets:own`). `orca plugin inspect .` lists exactly what it would be granted.

## Develop

The source lives in [gokul-kulkarni/narada](https://github.com/gokul-kulkarni/narada) under
`apps/orca-plugin`. [gokul-kulkarni/narada-orca](https://github.com/gokul-kulkarni/narada-orca) is
the release repository Orca installs from: `pnpm release` copies the manifest, panel sources,
worker bundle and license there, then tags the version. Don't edit the release repository by hand.

The worker imports `@narada/core` from this workspace, so Orca runs a bundle of it:
`dist/worker.js`, built by `pnpm build` and committed (Orca does not build plugins on install).
The panel imports only `orca` and relative files, as Orca requires.

```sh
pnpm build                       # bundle src/worker.ts + @narada/core into dist/worker.js
pnpm test                        # orca plugin test: worker against a temp folder and local server,
                                 # panel with orca/testing
pnpm check                       # orca plugin check: renders each src/panel.check.ts scenario
orca plugin dev watch . --check  # load this folder into Orca; reloads on save, Ctrl-C unloads
```

From the repository root, `pnpm check` runs typecheck, lint and tests for every project, and
`pnpm nx run @narada/orca-plugin:build` rebuilds the bundle (Nx rebuilds it before tests).

| File              | What it does                                                     |
| ----------------- | ---------------------------------------------------------------- |
| `src/panel.tsx`   | The sidebar panel: environment, request tree, notices, secrets   |
| `src/panel/*`     | Panel state (atoms, worker calls), request editor, response view |
| `src/protocol.ts` | The panel ↔ worker contract                                      |
| `src/worker.ts`   | Worker entry: loads the folder, answers the panel                |
| `src/worker/*`    | Folder lookup, file store, tree building, sending, cURL import   |
| `src/shared/*`    | Pure helpers both sides use (header lines)                       |
