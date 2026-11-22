import { describe, expect, it } from "vitest";
import { generateCode } from "./codegen";
import { parseCurl } from "./curl";
import type { PreparedRequest } from "./prepare-request";

const request: PreparedRequest = {
  method: "POST",
  url: "https://api.dev/items?q=it's",
  headers: [["Content-Type", "application/json"]],
  body: { type: "text", content: '{"name":"O\'Brien"}' },
  timeoutMs: 1000,
};

describe("generateCode", () => {
  it("generates curl that our own parser reads back", () => {
    const code = generateCode(request, "curl");
    expect(code).toContain(`curl -X POST 'https://api.dev/items?q=it'\\''s'`);
    const parsed = parseCurl(code);
    expect(parsed).toMatchObject({
      method: "POST",
      url: "https://api.dev/items?q=it's",
      body: { mode: "raw", raw: '{"name":"O\'Brien"}' },
    });
  });

  it("generates fetch and python", () => {
    const fetchCode = generateCode(request, "fetch");
    expect(fetchCode).toContain('await fetch("https://api.dev/items?q=it\'s"');
    expect(fetchCode).toContain('"Content-Type": "application/json"');
    expect(fetchCode).toContain(`body: "{\\"name\\":\\"O'Brien\\"}"`);
    const py = generateCode(request, "python");
    expect(py).toContain(
      'response = requests.request("POST", "https://api.dev/items?q=it\'s", headers=headers, data=data)',
    );
  });

  it("handles multipart and bodiless requests", () => {
    const multipart: PreparedRequest = {
      ...request,
      headers: [],
      body: { type: "multipart", fields: [["a", "1"]] },
    };
    expect(generateCode(multipart, "curl")).toContain("-F 'a=1'");
    expect(generateCode(multipart, "fetch")).toContain('form.append("a", "1");');
    expect(generateCode(multipart, "python")).toContain('"a": (None, "1"),');
    const get: PreparedRequest = { ...request, method: "GET", headers: [], body: { type: "none" } };
    expect(generateCode(get, "python")).toContain(
      'requests.request("GET", "https://api.dev/items?q=it\'s")',
    );
    expect(generateCode(get, "fetch")).not.toContain("body");
  });
});
