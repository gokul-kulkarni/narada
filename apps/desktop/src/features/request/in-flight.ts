/** One abort controller per tab with a request in flight, so the UI can stop it. */
const controllers = new Map<string, AbortController>();

/** Starts tracking a delivery for `tabId`, stopping one already in flight there. */
export function beginDelivery(tabId: string): AbortSignal {
  controllers.get(tabId)?.abort();
  const controller = new AbortController();
  controllers.set(tabId, controller);
  return controller.signal;
}

export function endDelivery(tabId: string, signal: AbortSignal): void {
  if (controllers.get(tabId)?.signal === signal) controllers.delete(tabId);
}

export function stopDelivery(tabId: string): void {
  controllers.get(tabId)?.abort();
}
