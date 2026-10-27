export interface Snippet {
  readonly label: string;
  readonly code: string;
}

export const PRE_REQUEST_SNIPPETS: readonly Snippet[] = [
  { label: "Set a variable", code: 'pm.environment.set("timestamp", Date.now());' },
  {
    label: "Add a header",
    code: 'pm.request.headers.add({ key: "X-Request-Id", value: crypto.randomUUID() });',
  },
  { label: "Log a variable", code: 'console.log(pm.variables.get("baseUrl"));' },
];

export const TEST_SNIPPETS: readonly Snippet[] = [
  {
    label: "Status code is 200",
    code: 'pm.test("Status code is 200", () => {\n  pm.response.to.have.status(200);\n});',
  },
  {
    label: "Response time < 500ms",
    code: 'pm.test("Response time is below 500ms", () => {\n  pm.expect(pm.response.responseTime).to.be.below(500);\n});',
  },
  {
    label: "JSON value check",
    code: 'pm.test("Body has id", () => {\n  pm.expect(pm.response.json()).to.have.property("id");\n});',
  },
  { label: "Save token from body", code: 'pm.environment.set("token", pm.response.json().token);' },
  {
    label: "Header is present",
    code: 'pm.test("Content-Type is present", () => {\n  pm.response.to.have.header("Content-Type");\n});',
  },
];

export const appendSnippet = (script: string, snippet: Snippet): string =>
  script.trim() ? `${script.trimEnd()}\n\n${snippet.code}` : snippet.code;
