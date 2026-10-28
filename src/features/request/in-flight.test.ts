import { describe, expect, it } from "vitest";
import { beginDelivery, endDelivery, stopDelivery } from "./in-flight";

describe("in-flight deliveries", () => {
  it("stops the delivery of a tab", () => {
    const signal = beginDelivery("a");
    stopDelivery("a");
    expect(signal.aborted).toBe(true);
  });

  it("stops the previous delivery when the tab sends again", () => {
    const first = beginDelivery("b");
    const second = beginDelivery("b");
    expect(first.aborted).toBe(true);
    endDelivery("b", first);
    stopDelivery("b");
    expect(second.aborted).toBe(true);
  });

  it("forgets a finished delivery", () => {
    const signal = beginDelivery("c");
    endDelivery("c", signal);
    stopDelivery("c");
    expect(signal.aborted).toBe(false);
  });
});
