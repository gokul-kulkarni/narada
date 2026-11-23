import { describe, expect, it } from "vitest";
import { serverUrl, setupSnippets } from "./snippets";

describe("setupSnippets", () => {
  it("connects Claude Code, Codex and JSON-config agents to the loopback server", () => {
    const [claude, codex, json] = setupSnippets(7377, "tok");
    expect(serverUrl(7377)).toBe("http://127.0.0.1:7377/mcp");
    expect(claude?.text).toBe(
      'claude mcp add --transport http --scope user narada http://127.0.0.1:7377/mcp --header "Authorization: Bearer tok"',
    );
    expect(codex?.text).toBe(
      "export NARADA_MCP_TOKEN=tok\ncodex mcp add narada --url http://127.0.0.1:7377/mcp --bearer-token-env-var NARADA_MCP_TOKEN",
    );
    expect(JSON.parse(json?.text ?? "")).toEqual({
      mcpServers: {
        narada: { url: "http://127.0.0.1:7377/mcp", headers: { Authorization: "Bearer tok" } },
      },
    });
  });
});
