import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { newRequest } from "@narada/core/factories";
import type { CreatePlan } from "@narada/core/mcp-server/create";
import { useMcpApprovalStore } from "../../state/mcp-approval-store";
import { resetStores } from "../../test/reset-stores";
import { ApprovalDialog } from "./ApprovalDialog";

const attention = vi.hoisted(() => ({ drawAttention: vi.fn(async () => {}) }));
vi.mock("../../lib/window-attention", () => attention);

/** Buttons start inactive for a moment, so a click meant for the previous request can't land. */
async function armed(button: HTMLElement): Promise<HTMLElement> {
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

const plan: CreatePlan = {
  kind: "requests",
  collection: { id: null, name: "Billing" },
  folderPath: ["invoices", "admin"],
  newFolders: ["admin"],
  requests: [
    {
      request: newRequest({
        name: "Void invoice (2)",
        method: "DELETE",
        url: "{{baseUrl}}/invoices/{{id}}",
      }),
      renamedFrom: "Void invoice",
    },
    {
      request: newRequest({ name: "List invoices", url: "{{baseUrl}}/invoices" }),
      renamedFrom: null,
    },
  ],
  variables: [],
  replacedSecrets: ["token"],
  missingVariables: ["id"],
};

describe("ApprovalDialog", () => {
  beforeEach(() => resetStores());

  it("shows nothing while no agent is waiting", () => {
    const { container } = render(<ApprovalDialog />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows exactly what will be added and adds it on approval", async () => {
    render(<ApprovalDialog />);
    let approved: Promise<string> = Promise.resolve("declined");
    act(() => {
      approved = useMcpApprovalStore.getState().request("Claude Code", { kind: "create", plan });
    });
    const dialog = screen.getByRole("dialog", { name: "Claude Code wants to add to Narada" });
    expect(attention.drawAttention).toHaveBeenCalled();
    const tree = within(dialog).getByRole("tree", { name: "What will be added" });
    expect(within(tree).getByText("Billing")).toBeInTheDocument();
    expect(within(tree).getAllByText("new")).toHaveLength(2); // the collection and the "admin" folder
    expect(within(tree).getByText("Void invoice (2)")).toBeInTheDocument();
    expect(within(tree).getByText(/renamed from "Void invoice"/)).toBeInTheDocument();
    expect(within(dialog).getByText(/You'll need to set: token/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Not defined yet: id/)).toBeInTheDocument();
    fireEvent.click(await armed(within(dialog).getByRole("button", { name: "Add" })));
    expect(await approved).toBe("approved");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("declines, and can allow the rest of the session", async () => {
    render(<ApprovalDialog />);
    let first: Promise<string> = Promise.resolve("approved");
    let second: Promise<string> = Promise.resolve("declined");
    act(() => {
      first = useMcpApprovalStore.getState().request(null, { kind: "create", plan });
      second = useMcpApprovalStore.getState().request(null, { kind: "create", plan });
    });
    fireEvent.click(await armed(screen.getByRole("button", { name: "Cancel" })));
    expect(await first).toBe("declined");
    expect(
      screen.getByRole("dialog", { name: "A coding agent wants to add to Narada" }),
    ).toBeInTheDocument();
    fireEvent.click(await armed(screen.getByRole("button", { name: "Allow for this session" })));
    expect(await second).toBe("approved");
    expect(useMcpApprovalStore.getState().allowedForSession).toBe(true);
  });

  it("shows a change to a saved request as a diff, with no session-wide option", async () => {
    render(<ApprovalDialog />);
    const before = newRequest({ name: "Create order", method: "GET" });
    let approved: Promise<string> = Promise.resolve("declined");
    act(() => {
      approved = useMcpApprovalStore.getState().request("Codex", {
        kind: "update",
        plan: {
          collectionId: "c1",
          collectionName: "Shop",
          requestId: before.id,
          requestName: "Create order",
          before,
          after: { ...before, method: "POST" },
          changes: [{ label: "Method", before: "GET", after: "POST" }],
          warnings: [],
          replacedSecrets: ["token"],
        },
      });
    });
    const dialog = screen.getByRole("dialog", { name: "Codex wants to change a request" });
    expect(within(dialog).getByText("Shop / Create order")).toBeInTheDocument();
    expect(within(dialog).getByText("GET")).toBeInTheDocument();
    expect(within(dialog).getByText("POST")).toBeInTheDocument();
    expect(within(dialog).getByText(/You'll need to set: token/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Allow/ })).toBeNull();
    fireEvent.click(await armed(within(dialog).getByRole("button", { name: "Apply" })));
    expect(await approved).toBe("approved");
  });

  it("shows where a request will be sent, and can allow that host for the session", async () => {
    render(<ApprovalDialog />);
    let approved: Promise<string> = Promise.resolve("declined");
    act(() => {
      approved = useMcpApprovalStore.getState().request("Claude Code", {
        kind: "send",
        request: newRequest({ name: "Orders", method: "DELETE", url: "{{baseUrl}}/orders/1" }),
        host: "shop.dev",
        environment: "dev",
        saved: true,
      });
    });
    const dialog = screen.getByRole("dialog", { name: "Claude Code wants to send a request" });
    expect(within(dialog).getByText("DELETE")).toBeInTheDocument();
    expect(within(dialog).getByText(/^to shop.dev/)).toBeInTheDocument();
    expect(within(dialog).getByText(/"dev"/)).toBeInTheDocument();
    fireEvent.click(
      await armed(
        within(dialog).getByRole("button", { name: "Allow sending to shop.dev this session" }),
      ),
    );
    expect(await approved).toBe("approved");
    expect(useMcpApprovalStore.getState().allowedHosts.has("shop.dev")).toBe(true);
  });

  it("ignores a click that lands just as the next request appears, and counts what waits", async () => {
    render(<ApprovalDialog />);
    let first: Promise<string> = Promise.resolve("declined");
    let second: Promise<string> = Promise.resolve("approved");
    act(() => {
      first = useMcpApprovalStore.getState().request(null, { kind: "create", plan });
      second = useMcpApprovalStore.getState().request(null, { kind: "create", plan });
    });
    expect(screen.getByText(/1 more waiting after this/)).toBeInTheDocument();
    fireEvent.click(await armed(screen.getByRole("button", { name: "Add" })));
    expect(await first).toBe("approved");
    // The same spot now holds the next request's button, inactive for a moment.
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(useMcpApprovalStore.getState().queue).toHaveLength(1);
    fireEvent.click(await armed(screen.getByRole("button", { name: "Cancel" })));
    expect(await second).toBe("declined");
  });
});
