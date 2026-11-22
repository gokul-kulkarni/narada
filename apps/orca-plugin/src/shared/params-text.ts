// Query parameters edited as text, one `key=value` per line. The panel may import only `orca` and
// relative files, so this mirrors the parsing and encoding of @narada/core/url-params.

export interface ParamLine {
  readonly key: string;
  readonly value: string;
}

const VARIABLE_SPLIT = /(\{\{[^{}]*\}\})/;

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** Percent-encodes text but leaves `{{variables}}` readable. */
function encodeKeepingVariables(text: string): string {
  return text
    .split(VARIABLE_SPLIT)
    .map((part) => (VARIABLE_SPLIT.test(part) ? part : encodeURIComponent(part)))
    .join("");
}

function splitUrl(url: string): { base: string; query: string; fragment: string } {
  const hashIndex = url.indexOf("#");
  const fragment = hashIndex === -1 ? "" : url.slice(hashIndex);
  const withoutFragment = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const queryIndex = withoutFragment.indexOf("?");
  return queryIndex === -1
    ? { base: withoutFragment, query: "", fragment }
    : {
        base: withoutFragment.slice(0, queryIndex),
        query: withoutFragment.slice(queryIndex + 1),
        fragment,
      };
}

const formatLine = ({ key, value }: ParamLine) => (value === "" ? key : `${key}=${value}`);

/** The URL's query as `key=value` lines, decoded. */
export function formatParamLines(url: string): string {
  return splitUrl(url)
    .query.split("&")
    .filter((pair) => pair !== "")
    .map((pair) => {
      const equals = pair.indexOf("=");
      return equals === -1
        ? { key: safeDecode(pair), value: "" }
        : { key: safeDecode(pair.slice(0, equals)), value: safeDecode(pair.slice(equals + 1)) };
    })
    .map(formatLine)
    .join("\n");
}

/**
 * Parses `key=value` lines, splitting at the first `=`. Blank lines and lines starting with `#` or
 * `//` are skipped, so a parameter can be switched off by commenting it out.
 */
export function parseParamLines(text: string): ParamLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#") && !line.startsWith("//"))
    .map((line) => {
      const equals = line.indexOf("=");
      return equals === -1
        ? { key: line, value: "" }
        : { key: line.slice(0, equals).trim(), value: line.slice(equals + 1).trim() };
    })
    .filter(({ key }) => key !== "");
}

/** The URL with its query replaced by the parameters in `text`; the path and #fragment are kept. */
export function urlWithParamLines(url: string, text: string): string {
  const { base, fragment } = splitUrl(url);
  const query = parseParamLines(text)
    .map(({ key, value }) =>
      value === ""
        ? encodeKeepingVariables(key)
        : `${encodeKeepingVariables(key)}=${encodeKeepingVariables(value)}`,
    )
    .join("&");
  return `${base}${query ? `?${query}` : ""}${fragment}`;
}
