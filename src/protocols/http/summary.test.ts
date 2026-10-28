import { describe, expect, it } from "vitest";
import { newRequest } from "../../lib/factories";
import type { HistoryEntry, HttpResponse } from "../../lib/model";
import { httpBadge, httpProgress, httpShortSummary, httpSummary, httpTarget } from "./summary";

const response: HttpResponse = {
  status: 404,
  statusText: "Not Found",
  headers: [],
  body: "",
  isBinary: false,
  sizeBytes: 2048,
  timeMs: 1500,
};

describe("HTTP summaries", () => {
  const request = newRequest({ method: "POST", url: "{{baseUrl}}/pets?x=1" });

  it("tags and shortens the request", () => {
    expect(httpBadge(request)).toBe("POST");
    expect(httpTarget(request)).toBe("/pets?x=1");
  });

  it("words a delivery, its progress and a stopped stream", () => {
    const delivery = {
      protocol: "http" as const,
      response: { ...response, incomplete: "Stopped." },
    };
    expect(httpSummary(delivery)).toEqual({
      tone: "err",
      label: "Returned",
      detail: "404 Not Found · 1.50 s · 2.0 KB",
      note: "Stopped.",
    });
    expect(httpProgress(delivery)).toBe("Receiving · 404 Not Found · 2.0 KB");
  });

  it("summarises history entries, including ones that never arrived", () => {
    const entry: HistoryEntry = { id: "1", sentAt: "", request, status: null, timeMs: null };
    expect(httpShortSummary(entry)).toEqual({
      tone: "err",
      label: "Not delivered",
      code: "ERR",
      timeMs: null,
    });
    expect(httpShortSummary({ ...entry, status: 200, timeMs: 5 }).code).toBe("200");
  });
});
