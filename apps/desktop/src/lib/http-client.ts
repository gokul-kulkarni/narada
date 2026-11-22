import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { createReceiver, sendWithFetch, type SendOptions } from "@narada/core/http/fetch-transport";
import { newId } from "@narada/core/ids";
import type { HttpResponse } from "@narada/core/model";
import type { PreparedRequest } from "@narada/core/prepare-request";
import type { StreamEvent } from "@narada/core/stream/stream-state";

export type { SendOptions };

async function sendWithTauri(request: PreparedRequest, options: SendOptions) {
  const id = newId();
  const receiver = createReceiver(options);
  let ended = () => {};
  const done = new Promise<void>((resolve) => (ended = resolve));
  const channel = new Channel<StreamEvent>();
  channel.onmessage = (event) => {
    receiver.receive(event);
    if (event.kind === "end") ended();
  };
  const stop = () => void invoke("cancel_request", { id });
  options.signal?.addEventListener("abort", stop, { once: true });
  try {
    await invoke("send_request", { request, id, channel });
    await done;
    return receiver.finish();
  } finally {
    options.signal?.removeEventListener("abort", stop);
  }
}

export async function sendHttp(
  request: PreparedRequest,
  options: SendOptions = {},
): Promise<HttpResponse> {
  return isTauri() ? sendWithTauri(request, options) : sendWithFetch(request, options);
}
