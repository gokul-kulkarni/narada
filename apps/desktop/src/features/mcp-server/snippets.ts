/** Where the server listens; always loopback. */
export const serverUrl = (port: number): string => `http://127.0.0.1:${port}/mcp`;

export interface SetupSnippet {
  readonly id: "claude" | "codex" | "json";
  readonly title: string;
  readonly note: string;
  readonly text: string;
}

/** How to connect each agent. `token` may be a mask for display; copy with the real one. */
export function setupSnippets(port: number, token: string): SetupSnippet[] {
  const url = serverUrl(port);
  return [
    {
      id: "claude",
      title: "Claude Code",
      note: "Run once in a terminal.",
      text: `claude mcp add --transport http --scope user narada ${url} --header "Authorization: Bearer ${token}"`,
    },
    {
      id: "codex",
      title: "Codex",
      note: "Put the export in your shell profile; Codex reads the token from it.",
      text: `export NARADA_MCP_TOKEN=${token}\ncodex mcp add narada --url ${url} --bearer-token-env-var NARADA_MCP_TOKEN`,
    },
    {
      id: "json",
      title: "Cursor and others",
      note: "Add to the mcpServers config (Cursor: ~/.cursor/mcp.json).",
      text: JSON.stringify(
        { mcpServers: { narada: { url, headers: { Authorization: `Bearer ${token}` } } } },
        null,
        2,
      ),
    },
  ];
}
