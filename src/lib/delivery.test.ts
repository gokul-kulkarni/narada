import { describe, expect, it } from "vitest";
import { deliveriesFor, deliveryOutcome, formatSentAt, shortUrl } from "./delivery";
import { newRequest } from "./factories";
import type { HistoryEntry } from "./model";

const entry = (id: string, requestId: string): HistoryEntry => ({
  id,
  sentAt: "2026-10-28T10:42:00.000Z",
  request: { ...newRequest(), id: requestId },
  status: 200,
  timeMs: 12,
});

describe("deliveryOutcome", () => {
  it("calls 1xx–3xx delivered", () => {
    expect(deliveryOutcome(200)).toEqual({ tone: "ok", label: "Delivered" });
    expect(deliveryOutcome(304)).toEqual({ tone: "ok", label: "Delivered" });
  });

  it("calls 4xx and 5xx returned", () => {
    expect(deliveryOutcome(404)).toEqual({ tone: "err", label: "Returned" });
    expect(deliveryOutcome(503)).toEqual({ tone: "err", label: "Returned" });
  });

  it("calls a missing status not delivered", () => {
    expect(deliveryOutcome(null)).toEqual({ tone: "err", label: "Not delivered" });
  });
});

describe("shortUrl", () => {
  it("drops a leading variable such as {{baseUrl}}", () => {
    expect(shortUrl("{{baseUrl}}/pets?limit=10")).toBe("/pets?limit=10");
  });

  it("keeps path and query of an absolute URL", () => {
    expect(shortUrl("https://api.dev/users?page=2")).toBe("/users?page=2");
  });

  it("shows the host when the path is empty", () => {
    expect(shortUrl("https://api.dev")).toBe("api.dev/");
  });

  it("returns anything unparseable unchanged", () => {
    expect(shortUrl("not a url")).toBe("not a url");
    expect(shortUrl("")).toBe("");
  });
});

describe("deliveriesFor", () => {
  it("keeps only entries sent from the given request, newest first", () => {
    const entries = [entry("1", "a"), entry("2", "b"), entry("3", "a")];
    expect(deliveriesFor(entries, "a").map((e) => e.id)).toEqual(["1", "3"]);
  });
});

describe("formatSentAt", () => {
  const now = new Date(2026, 9, 28, 12, 0);

  it("shows only the time for today", () => {
    const sent = new Date(2026, 9, 28, 9, 5).toISOString();
    expect(formatSentAt(sent, now)).toBe(
      new Date(sent).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    );
  });

  it("adds the date for earlier days", () => {
    const sent = new Date(2026, 9, 20, 9, 5).toISOString();
    expect(formatSentAt(sent, now)).toContain(
      new Date(sent).toLocaleDateString([], { month: "short", day: "numeric" }),
    );
  });

  it("returns an empty string for an invalid date", () => {
    expect(formatSentAt("nope", now)).toBe("");
  });
});
