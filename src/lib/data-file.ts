export type DataRow = Readonly<Record<string, string>>;

/** RFC 4180-style CSV: quoted fields, escaped quotes, CRLF/LF, first row is the header. */
export function parseCsv(text: string): DataRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      rows.push([...row, field]);
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new Error("CSV has an unterminated quoted field");
  if (field !== "" || row.length > 0) rows.push([...row, field]);
  const [header, ...body] = rows.filter((r) => r.some((cell) => cell !== ""));
  if (!header) return [];
  return body.map((cells) =>
    Object.fromEntries(header.map((key, index) => [key.trim(), cells[index] ?? ""])),
  );
}

export function parseDataFile(text: string, fileName: string): DataRow[] {
  if (!fileName.toLowerCase().endsWith(".json")) return parseCsv(text);
  const parsed: unknown = JSON.parse(text);
  if (
    !Array.isArray(parsed) ||
    !parsed.every((row) => typeof row === "object" && row !== null && !Array.isArray(row))
  ) {
    throw new Error("JSON data files must be an array of objects");
  }
  return parsed.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]),
    ),
  );
}
