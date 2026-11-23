import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import type { AssistClient, AssistEvent, DetectedAgent } from "../../lib/assist/client";
import { setAssistClient } from "../../lib/assist/client";
import { useWorkspaceStore } from "../../state/workspace-store";
import { resetStores } from "../../test/reset-stores";

const CLAUDE: DetectedAgent = {
  id: "claude",
  name: "Claude Code",
  path: "/bin/claude",
  version: "2.1.330",
};

function installAgent(events: readonly AssistEvent[], agents = [CLAUDE]) {
  const client: AssistClient = {
    detect: vi.fn(async () => agents),
    run: vi.fn(async (_request, onEvent) => events.forEach(onEvent)),
  };
  setAssistClient(client);
  return client;
}

async function sendFailingRequest(status = 422) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response('{"error":"qty required"}', {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  render(<App />);
  await screen.findByRole("heading", { name: "Narada" });
  fireEvent.click(screen.getByRole("button", { name: "New request tab" }));
  fireEvent.change(screen.getByLabelText("URL"), { target: { value: "https://shop.dev/orders" } });
  fireEvent.click(screen.getByRole("button", { name: "Dispatch" }));
  await screen.findByTestId("response-status");
}

describe("asking an agent about a delivery", () => {
  beforeEach(() => {
    resetStores();
    vi.restoreAllMocks();
  });

  it("previews the redacted prompt, then streams the agent's answer beside the response", async () => {
    const client = installAgent([
      { kind: "started", sessionId: "s" },
      { kind: "activity", label: "Reading src/orders.ts" },
      { kind: "text", text: "The server needs `qty`." },
      { kind: "done", sessionId: "s", costUsd: 0.0123 },
    ]);
    await sendFailingRequest();

    fireEvent.click(await screen.findByRole("button", { name: "Ask Claude Code" }));
    const dialog = await screen.findByRole("dialog", { name: "Ask Claude Code?" });
    expect(within(dialog).getByText("/bin/claude")).toBeInTheDocument();
    const preview = within(dialog).getByLabelText("What will be sent") as HTMLTextAreaElement;
    expect(preview.value).toContain("https://shop.dev/orders");
    expect(preview.value).toContain("qty required");
    fireEvent.click(within(dialog).getByRole("button", { name: "Send to Claude Code" }));

    const panel = await screen.findByRole("complementary", { name: "Claude Code's answer" });
    const answer = await within(panel).findByText(
      (_, el) => el?.tagName === "P" && el.textContent === "The server needs qty.",
    );
    expect(within(answer).getByText("qty").tagName).toBe("CODE");
    expect(within(panel).getByText("Done · $0.01")).toBeInTheDocument();
    expect(client.run).toHaveBeenCalledWith(
      { agentId: "claude", prompt: preview.value, sessionId: null, cwd: null },
      expect.any(Function),
      expect.any(AbortSignal),
    );

    vi.mocked(client.run).mockImplementationOnce(async (_r, onEvent) => {
      onEvent({ kind: "text", text: "Send it as JSON." });
      onEvent({ kind: "done", sessionId: "s", costUsd: 0.01 });
    });
    fireEvent.change(within(panel).getByLabelText("Follow-up question"), {
      target: { value: "What body should I send?" },
    });
    fireEvent.click(within(panel).getByRole("button", { name: "Ask" }));
    expect(await within(panel).findByText("Send it as JSON.")).toBeInTheDocument();
    expect(within(panel).getByText("What body should I send?")).toBeInTheDocument();
    expect(within(panel).getByText("qty")).toBeInTheDocument(); // the first answer stays
    expect(client.run).toHaveBeenLastCalledWith(
      { agentId: "claude", prompt: "What body should I send?", sessionId: "s", cwd: null },
      expect.any(Function),
      expect.any(AbortSignal),
    );

    fireEvent.click(within(panel).getByRole("button", { name: "Close answer" }));
    expect(screen.queryByRole("complementary", { name: "Claude Code's answer" })).toBeNull();
  });

  it("skips the preview once the user chose not to see it again", async () => {
    const client = installAgent([
      { kind: "text", text: "Again." },
      { kind: "done", sessionId: null, costUsd: null },
    ]);
    await sendFailingRequest();
    fireEvent.click(await screen.findByRole("button", { name: "Ask Claude Code" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByLabelText("Don't show this preview again on this computer"),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Send to Claude Code" }));
    await screen.findByText("Again.");

    fireEvent.click(screen.getByRole("button", { name: "Ask Claude Code" }));
    await waitFor(() => expect(client.run).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("never sends a secret environment value", async () => {
    const client = installAgent([{ kind: "done", sessionId: null, costUsd: null }]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"echo":"sk-very-secret-1"}', { status: 401 }),
    );
    render(<App />);
    await screen.findByRole("heading", { name: "Narada" });
    const env = useWorkspaceStore.getState().createEnvironment("dev");
    await useWorkspaceStore.getState().updateEnvironment(env.id, (e) => ({
      ...e,
      variables: [
        { id: "v", key: "token", value: "sk-very-secret-1", enabled: true, secret: true },
      ],
    }));
    useWorkspaceStore.getState().setActiveEnvironment(env.id);
    fireEvent.click(screen.getByRole("button", { name: "New request tab" }));
    fireEvent.change(screen.getByLabelText("URL"), { target: { value: "https://shop.dev/me" } });
    fireEvent.click(screen.getByRole("button", { name: "Dispatch" }));
    fireEvent.click(await screen.findByRole("button", { name: "Ask Claude Code" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Send to Claude Code" }));
    await waitFor(() => expect(client.run).toHaveBeenCalled());
    const prompt = vi.mocked(client.run).mock.calls[0]?.[0].prompt ?? "";
    expect(prompt).not.toContain("sk-very-secret-1");
    expect(prompt).toContain("[secret:token]");
  });

  it("offers nothing when no agent is installed", async () => {
    const client = installAgent([], []);
    await sendFailingRequest();
    await waitFor(() => expect(client.detect).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /^Ask / })).toBeNull();
  });

  it("offers nothing when the response succeeded", async () => {
    installAgent([]);
    await sendFailingRequest(200);
    expect(screen.queryByRole("button", { name: /^Ask / })).toBeNull();
  });
});
