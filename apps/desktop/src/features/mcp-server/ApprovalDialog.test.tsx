import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { newRequest } from "@narada/core/factories";
import type { CreatePlan } from "@narada/core/mcp-server/create";
import { useMcpApprovalStore } from "../../state/mcp-approval-store";
import { resetStores } from "../../test/reset-stores";
import { ApprovalDialog } from "./ApprovalDialog";

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
    let approved: Promise<boolean> = Promise.resolve(false);
    act(() => {
      approved = useMcpApprovalStore.getState().request("Claude Code", plan);
    });
    const dialog = screen.getByRole("dialog", { name: "Claude Code wants to add to Narada" });
    const tree = within(dialog).getByRole("tree", { name: "What will be added" });
    expect(within(tree).getByText("Billing")).toBeInTheDocument();
    expect(within(tree).getAllByText("new")).toHaveLength(2); // the collection and the "admin" folder
    expect(within(tree).getByText("Void invoice (2)")).toBeInTheDocument();
    expect(within(tree).getByText(/renamed from "Void invoice"/)).toBeInTheDocument();
    expect(within(dialog).getByText(/You'll need to set: token/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Not defined yet: id/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(await approved).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("declines, and can allow the rest of the session", async () => {
    render(<ApprovalDialog />);
    let first: Promise<boolean> = Promise.resolve(true);
    let second: Promise<boolean> = Promise.resolve(false);
    act(() => {
      first = useMcpApprovalStore.getState().request(null, plan);
      second = useMcpApprovalStore.getState().request(null, plan);
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await first).toBe(false);
    expect(
      screen.getByRole("dialog", { name: "A coding agent wants to add to Narada" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Allow for this session" }));
    expect(await second).toBe(true);
    expect(useMcpApprovalStore.getState().allowedForSession).toBe(true);
  });
});
