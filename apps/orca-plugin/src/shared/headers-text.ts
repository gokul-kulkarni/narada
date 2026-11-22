// Headers edited as text, one `Name: value` per line. Pure, so the panel and the worker share it.

export interface HeaderLine {
  readonly key: string;
  readonly value: string;
}

/** Formats headers as `Name: value` lines. */
export function formatHeaderLines(headers: readonly HeaderLine[]): string {
  return headers.map(({ key, value }) => `${key}: ${value}`).join("\n");
}

/**
 * Parses `Name: value` lines. Blank lines and lines starting with `#` or `//` are skipped, so a
 * header can be switched off by commenting it out; a line without a colon is a header with no value.
 */
export function parseHeaderLines(text: string): HeaderLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#") && !line.startsWith("//"))
    .map((line) => {
      const colon = line.indexOf(":");
      return colon === -1
        ? { key: line, value: "" }
        : { key: line.slice(0, colon).trim(), value: line.slice(colon + 1).trim() };
    })
    .filter(({ key }) => key !== "");
}
