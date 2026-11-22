import { assert, test } from "orca/testing";
import { formatParamLines, parseParamLines, urlWithParamLines } from "./params-text";

test("lists a URL's query as key=value lines, decoded", () => {
  assert.equal(
    formatParamLines("{{base}}/orders?limit=2&q=a%20b&flag&next={{cursor}}#top"),
    "limit=2\nq=a b\nflag\nnext={{cursor}}",
  );
  assert.equal(formatParamLines("https://api.example.com/items"), "");
});

test("parses lines, splitting at the first = and skipping blanks and comments", () => {
  assert.deepEqual(parseParamLines("a=1\n\n# off=1\n// old=2\n  b = x=y \nflag\n=nameless"), [
    { key: "a", value: "1" },
    { key: "b", value: "x=y" },
    { key: "flag", value: "" },
  ]);
});

test("rewrites only the query, encoding values but keeping {{variables}}", () => {
  assert.equal(
    urlWithParamLines("{{base}}/orders?old=1#top", "limit=5\nq=a b&c\nid={{orderId}}\n# skip=1"),
    "{{base}}/orders?limit=5&q=a%20b%26c&id={{orderId}}#top",
  );
  assert.equal(urlWithParamLines("{{base}}/orders?old=1", ""), "{{base}}/orders");
  assert.equal(urlWithParamLines("{{base}}/x", "flag"), "{{base}}/x?flag");
});

test("round-trips what it formats", () => {
  const url = "https://h/p?a=1&b=two%20words&c={{v}}";
  assert.equal(urlWithParamLines(url, formatParamLines(url)), url);
});
