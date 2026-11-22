export interface Throttled<T> {
  (value: T): void;
  /** Drops a pending call. */
  cancel: () => void;
}

/** Calls `fn` at most once per `intervalMs`, always with the latest value. */
export function throttle<T>(fn: (value: T) => void, intervalMs: number): Throttled<T> {
  let latest: { readonly value: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    const pending = latest;
    latest = null;
    if (pending) fn(pending.value);
  };
  const throttled = (value: T) => {
    latest = { value };
    timer ??= setTimeout(flush, intervalMs);
  };
  return Object.assign(throttled, {
    cancel: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      latest = null;
    },
  });
}
