import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Environment } from "../../lib/model";
import { useWorkspaceStore } from "../../state/workspace-store";
import { resetStores } from "../../test/reset-stores";
import { DeliverTo, SEGMENTED_ENVIRONMENT_LIMIT } from "./EnvironmentsPanel";

const env = (name: string): Environment => ({ id: name, name, variables: [] });

describe("DeliverTo", () => {
  beforeEach(() => resetStores());

  it("switches environments with segmented buttons", () => {
    useWorkspaceStore.setState({ environments: [env("local"), env("staging")] });
    render(<DeliverTo />);
    expect(screen.getByRole("button", { name: "None" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "staging" }));
    expect(useWorkspaceStore.getState().activeEnvironmentId).toBe("staging");
    expect(screen.getByRole("button", { name: "staging" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "None" }));
    expect(useWorkspaceStore.getState().activeEnvironmentId).toBeNull();
  });

  it("falls back to a dropdown when there are many environments", () => {
    const environments = Array.from({ length: SEGMENTED_ENVIRONMENT_LIMIT + 1 }, (_, i) =>
      env(`env-${i}`),
    );
    useWorkspaceStore.setState({ environments });
    render(<DeliverTo />);
    fireEvent.change(screen.getByLabelText("Deliver to"), { target: { value: "env-3" } });
    expect(useWorkspaceStore.getState().activeEnvironmentId).toBe("env-3");
    fireEvent.change(screen.getByLabelText("Deliver to"), { target: { value: "" } });
    expect(useWorkspaceStore.getState().activeEnvironmentId).toBeNull();
  });
});
