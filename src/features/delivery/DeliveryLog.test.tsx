import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { newRequest } from "../../lib/factories";
import type { Delivery, HistoryEntry, HttpResponse } from "../../lib/model";
import { useHistoryStore } from "../../state/history-store";
import { useTabsStore, type RequestTab } from "../../state/tabs-store";
import { resetStores } from "../../test/reset-stores";
import { DeliveryLog, PAST_DELIVERY_LIMIT } from "./DeliveryLog";
import { asHttp } from "../../test/http";

const request = { ...newRequest(), id: "req-1", url: "{{baseUrl}}/pets" };

const tab = (overrides: Partial<RequestTab> = {}): RequestTab => ({
  id: "tab-1",
  request,
  source: null,
  dirty: false,
  loading: false,
  partial: null,
  delivery: null,
  error: null,
  tests: [],
  logs: [],
  ...overrides,
});

const response: HttpResponse = {
  status: 201,
  statusText: "Created",
  headers: [],
  body: "{}",
  isBinary: false,
  sizeBytes: 2,
  timeMs: 42,
};

const http = (r: HttpResponse): Delivery => ({ protocol: "http", response: r });

const entry = (id: string, status: number | null, environment?: string): HistoryEntry => ({
  id,
  sentAt: new Date().toISOString(),
  request,
  status,
  timeMs: status === null ? null : 10,
  environment,
});

describe("DeliveryLog", () => {
  beforeEach(() => resetStores());

  it("explains the log before anything is sent", () => {
    render(<DeliveryLog tab={tab()} environment={null} />);
    expect(screen.getByText(/Nothing dispatched yet/)).toBeInTheDocument();
  });

  it("shows a pending delivery while sending", () => {
    render(<DeliveryLog tab={tab({ loading: true })} environment="staging" />);
    const pending = screen.getByRole("article", { name: "Dispatching" });
    expect(pending).toHaveTextContent("/pets→ staging");
    expect(pending).toHaveTextContent("Dispatching…");
  });

  it("shows the reply arriving and lets it be stopped", () => {
    const onStop = vi.fn();
    render(
      <DeliveryLog
        tab={tab({ loading: true, partial: http({ ...response, sizeBytes: 3400 }) })}
        environment={null}
        onStop={onStop}
        liveView={<p>live body</p>}
      />,
    );
    expect(screen.getByTestId("delivery-progress")).toHaveTextContent(
      "Receiving · 201 Created · 3.3 KB",
    );
    expect(screen.getByText("live body")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("notes a reply that ended early", () => {
    render(
      <DeliveryLog
        tab={tab({ delivery: http({ ...response, incomplete: "Stopped." }) })}
        environment={null}
      />,
    );
    expect(screen.getByRole("article", { name: "Latest delivery" })).toHaveTextContent("Stopped.");
  });

  it("expands the latest delivery with where it went and the response view", () => {
    useHistoryStore.setState({ entries: [entry("1", 201, "prod"), entry("2", 404, "local")] });
    render(
      <DeliveryLog
        tab={tab({ delivery: http(response) })}
        environment="staging"
        responseView={<p>response body</p>}
      />,
    );
    const latest = screen.getByRole("article", { name: "Latest delivery" });
    expect(latest).toHaveTextContent("→ prod");
    expect(within(latest).getByTestId("response-status")).toHaveTextContent(
      "Delivered · 201 Created · 42 ms · 2 B",
    );
    expect(within(latest).getByText("response body")).toBeInTheDocument();

    const log = screen.getByRole("list", { name: "Delivery log" });
    expect(within(log).getAllByRole("listitem")).toHaveLength(2);
    expect(within(log).getByRole("button")).toHaveTextContent("Returned · 404 · 10 ms");
  });

  it("reports a request that never arrived", () => {
    render(<DeliveryLog tab={tab({ error: "connection refused" })} environment={null} />);
    expect(screen.getByRole("alert")).toHaveTextContent("connection refused");
    expect(screen.getByTestId("response-status")).toHaveTextContent("Not delivered");
  });

  it("opens an earlier delivery in a new tab", () => {
    useHistoryStore.setState({ entries: [entry("1", null)] });
    render(<DeliveryLog tab={tab()} environment={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Not delivered/ }));
    const [opened] = useTabsStore.getState().tabs;
    expect(asHttp(opened.request).url).toBe("{{baseUrl}}/pets");
    expect(opened.request.id).not.toBe("req-1");
  });

  it("caps earlier deliveries and says how many are hidden", () => {
    const entries = Array.from({ length: PAST_DELIVERY_LIMIT + 2 }, (_, i) => entry(`${i}`, 200));
    useHistoryStore.setState({ entries });
    render(<DeliveryLog tab={tab()} environment={null} />);
    expect(screen.getAllByRole("button")).toHaveLength(PAST_DELIVERY_LIMIT);
    expect(screen.getByText("2 earlier deliveries in Recent deliveries")).toBeInTheDocument();
  });
});
