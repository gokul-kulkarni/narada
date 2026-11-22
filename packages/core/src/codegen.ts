import type { PreparedRequest } from "./prepare-request";

export const CODE_LANGUAGES = [
  { id: "curl", label: "cURL" },
  { id: "fetch", label: "JavaScript (fetch)" },
  { id: "python", label: "Python (requests)" },
] as const;
export type CodeLanguage = (typeof CODE_LANGUAGES)[number]["id"];

const shellQuote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;
const pyString = (text: string) => JSON.stringify(text);

function curl(r: PreparedRequest): string {
  const lines = [`curl -X ${r.method} ${shellQuote(r.url)}`];
  r.headers.forEach(([k, v]) => lines.push(`  -H ${shellQuote(`${k}: ${v}`)}`));
  if (r.body.type === "text") lines.push(`  --data-raw ${shellQuote(r.body.content)}`);
  if (r.body.type === "multipart")
    r.body.fields.forEach(([k, v]) => lines.push(`  -F ${shellQuote(`${k}=${v}`)}`));
  return lines.join(" \\\n");
}

function fetchCode(r: PreparedRequest): string {
  const headers = Object.fromEntries(r.headers);
  const setup =
    r.body.type === "multipart"
      ? `const form = new FormData();\n${r.body.fields.map(([k, v]) => `form.append(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join("\n")}\n\n`
      : "";
  const body =
    r.body.type === "text"
      ? `,\n  body: ${JSON.stringify(r.body.content)}`
      : r.body.type === "multipart"
        ? ",\n  body: form"
        : "";
  const headerPart =
    r.headers.length > 0
      ? `,\n  headers: ${JSON.stringify(headers, null, 2).replace(/\n/g, "\n  ")}`
      : "";
  return `${setup}const response = await fetch(${JSON.stringify(r.url)}, {\n  method: ${JSON.stringify(r.method)}${headerPart}${body}\n});\nconsole.log(response.status, await response.text());`;
}

function python(r: PreparedRequest): string {
  const lines = ["import requests", ""];
  const args = [`${pyString(r.method)}`, pyString(r.url)];
  if (r.headers.length > 0) {
    lines.push(
      `headers = {\n${r.headers.map(([k, v]) => `    ${pyString(k)}: ${pyString(v)},`).join("\n")}\n}`,
    );
    args.push("headers=headers");
  }
  if (r.body.type === "text") {
    lines.push(`data = ${pyString(r.body.content)}`);
    args.push("data=data");
  }
  if (r.body.type === "multipart") {
    lines.push(
      `files = {\n${r.body.fields.map(([k, v]) => `    ${pyString(k)}: (None, ${pyString(v)}),`).join("\n")}\n}`,
    );
    args.push("files=files");
  }
  lines.push(
    "",
    `response = requests.request(${args.join(", ")})`,
    "print(response.status_code, response.text)",
  );
  return lines.join("\n");
}

export function generateCode(request: PreparedRequest, language: CodeLanguage): string {
  switch (language) {
    case "curl":
      return curl(request);
    case "fetch":
      return fetchCode(request);
    case "python":
      return python(request);
  }
}
