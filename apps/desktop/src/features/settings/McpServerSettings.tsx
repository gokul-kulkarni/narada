import { useEffect, useState } from "react";
import { Card } from "../../components/page";
import { Button, TextInput } from "../../components/ui";
import { getNaradaMcpClient } from "../../lib/narada-mcp/client";
import { useMcpActivityStore } from "../../state/mcp-activity-store";
import { useMcpServerStore } from "../../state/mcp-server-store";
import { useUiStore } from "../../state/ui-store";
import { serverUrl, setupSnippets } from "../mcp-server/snippets";

const MASK = "••••••••";
const CODE = "rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs break-all";

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    useUiStore.getState().notify("Copied. It includes your token; keep it private.");
  } catch {
    useUiStore.getState().notify("Could not copy.");
  }
}

function PortField({ port }: { port: number }) {
  // Keyed by the saved port, so a saved change starts the field afresh.
  const [draft, setDraft] = useState(String(port));
  return (
    <label className="flex items-center gap-2 text-sm">
      Port
      <TextInput
        aria-label="Port"
        inputMode="numeric"
        className="w-24"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const next = Number(draft);
          if (next !== port) void useMcpServerStore.getState().setPort(next);
        }}
      />
    </label>
  );
}

function Setup({ port, token }: { port: number; token: string }) {
  const shown = setupSnippets(port, MASK);
  const real = setupSnippets(port, token);
  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-sm font-semibold">Connect a coding agent</h4>
      {shown.map((snippet, index) => (
        <div
          key={snippet.id}
          role="group"
          aria-label={snippet.title}
          className="flex flex-col gap-1"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{snippet.title}</span>
            <span className="text-xs text-muted">{snippet.note}</span>
            <Button
              variant="ghost"
              className="ml-auto"
              onClick={() => void copy(real[index]?.text ?? "")}
            >
              Copy
            </Button>
          </div>
          <pre className="overflow-x-auto rounded-lg bg-surface-2 p-2 font-mono text-xs whitespace-pre-wrap break-all">
            {snippet.text}
          </pre>
        </div>
      ))}
    </div>
  );
}

const SHOWN_ACTIVITY = 10;

/** What connected agents asked for since Narada started, newest first. */
function Activity() {
  const entries = useMcpActivityStore((s) => s.entries);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-sm font-semibold">Recent activity</h4>
      <ul aria-label="Recent MCP activity" className="flex flex-col gap-0.5 text-xs">
        {entries.slice(0, SHOWN_ACTIVITY).map((entry, index) => (
          <li key={`${entry.at}-${index}`} className="flex flex-wrap gap-2">
            <span className="text-muted">
              {new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span>{entry.client ?? "An agent"}</span>
            <code className="font-mono">{entry.tool}</code>
            <span className={entry.outcome === "ok" ? "text-ok" : "text-err"}>
              {entry.outcome === "ok" ? "answered" : entry.detail}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Lets coding agents (Claude Code, Codex, Cursor, …) connect to Narada over MCP. */
export function McpServerSettings() {
  const available = getNaradaMcpClient() !== null;
  const { settings, loaded, runningPort, token, error } = useMcpServerStore();

  useEffect(() => {
    if (available) void useMcpServerStore.getState().load();
  }, [available]);

  const description =
    "Coding agents can read your collections, environments (names only) and latest response while they work on your API's code. Secrets are removed, it listens only on this computer, and it is off until you turn it on.";
  if (!available) {
    return (
      <Card label="MCP server" title="MCP server" description={description}>
        <p className="text-sm text-muted">The MCP server works only in the desktop app.</p>
      </Card>
    );
  }

  return (
    <Card label="MCP server" title="MCP server" description={description}>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          disabled={!loaded}
          checked={settings.enabled}
          onChange={(e) => void useMcpServerStore.getState().setEnabled(e.target.checked)}
        />
        Let coding agents connect to Narada
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <PortField key={settings.port} port={settings.port} />
        {runningPort !== null && (
          <span className="flex items-center gap-2 text-sm text-muted">
            Listening at <code className={CODE}>{serverUrl(runningPort)}</code>
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-err-soft px-3 py-2 text-sm text-err">
          {error}
        </p>
      )}
      {settings.enabled && token && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            Token <code className={CODE}>{MASK}</code>
            <Button
              variant="ghost"
              onClick={() => void useMcpServerStore.getState().regenerateToken()}
            >
              New token
            </Button>
            <span className="text-xs text-muted">
              Kept in your keychain. A new token disconnects agents set up with the old one.
            </span>
          </div>
          <Setup port={runningPort ?? settings.port} token={token} />
        </>
      )}
      <Activity />
    </Card>
  );
}
