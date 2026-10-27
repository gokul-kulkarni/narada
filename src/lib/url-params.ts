export interface QueryParam {
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

export function parseQueryParams(url: string): QueryParam[] {
  return splitUrl(url)
    .query.split("&")
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const equalsIndex = pair.indexOf("=");
      return equalsIndex === -1
        ? { key: safeDecode(pair), value: "" }
        : {
            key: safeDecode(pair.slice(0, equalsIndex)),
            value: safeDecode(pair.slice(equalsIndex + 1)),
          };
    });
}

export function withQueryParams(url: string, params: readonly QueryParam[]): string {
  const { base, fragment } = splitUrl(url);
  const query = params
    .map(({ key, value }) =>
      value === "" && key !== ""
        ? encodeKeepingVariables(key)
        : `${encodeKeepingVariables(key)}=${encodeKeepingVariables(value)}`,
    )
    .join("&");
  return `${base}${query ? `?${query}` : ""}${fragment}`;
}
