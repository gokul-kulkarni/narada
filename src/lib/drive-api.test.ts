import { describe, expect, it } from "vitest";
import { summarizeSync } from "./drive-api";

const empty = { uploaded: [], downloaded: [], deletedLocal: [], deletedRemote: [], conflicts: [] };

describe("summarizeSync", () => {
  it("describes no-op and changed syncs", () => {
    expect(summarizeSync(empty)).toBe("Google Drive is up to date.");
    expect(
      summarizeSync({ ...empty, uploaded: ["a"], deletedRemote: ["b"], deletedLocal: ["c"] }),
    ).toBe("Synced with Google Drive: 1 uploaded, 2 deleted.");
  });

  it("calls out conflicts", () => {
    expect(
      summarizeSync({ ...empty, downloaded: ["x"], conflicts: ["collections/a.json"] }),
    ).toMatch(/1 downloaded\. 1 conflict\(s\).*collections\/a\.json/);
  });
});
