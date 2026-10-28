import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { throttle } from "./throttle";

describe("throttle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("calls once per interval with the latest value", () => {
    const fn = vi.fn();
    const t = throttle(fn, 50);
    t(1);
    t(2);
    t(3);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledExactlyOnceWith(3);
    t(4);
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenLastCalledWith(4);
  });

  it("drops a pending call when cancelled", () => {
    const fn = vi.fn();
    const t = throttle(fn, 50);
    t(1);
    t.cancel();
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
  });
});
