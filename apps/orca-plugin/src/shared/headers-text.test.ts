import { assert, test } from "orca/testing";
import { formatHeaderLines, parseHeaderLines } from "./headers-text";

test("parses Name: value lines, skipping blanks and comments", () => {
  const text =
    "Accept: application/json\n\n# Authorization: off\n// X-Old: 1\nX-Empty\nX-Url: http://a:1/b\n: no name";
  assert.deepEqual(parseHeaderLines(text), [
    { key: "Accept", value: "application/json" },
    { key: "X-Empty", value: "" },
    { key: "X-Url", value: "http://a:1/b" },
  ]);
});

test("formats headers back into lines", () => {
  const headers = [
    { key: "A", value: "1" },
    { key: "B", value: "two words" },
  ];
  assert.equal(formatHeaderLines(headers), "A: 1\nB: two words");
  assert.deepEqual(parseHeaderLines(formatHeaderLines(headers)), headers);
});
