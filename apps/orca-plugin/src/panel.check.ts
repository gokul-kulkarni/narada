// `orca plugin check` renders the panel once per scenario with these worker answers.
import { defineCheck } from "orca/testing";
import { KEYS, RESPONSE, SNAPSHOT } from "./fixtures/snapshot";

const answers = {
  "workspace.load": () => SNAPSHOT,
  "request.send": () => ({ ok: true as const, response: RESPONSE }),
};

export default defineCheck({
  noFolder: {
    requests: {
      "workspace.load": () => ({
        ...SNAPSHOT,
        tree: [],
        requests: {},
        folder: { ...SNAPSHOT.folder, exists: false },
      }),
    },
  },
  browsing: { requests: answers },
  requestChosen: {
    requests: answers,
    persisted: { plugin: { selectedKey: KEYS.create, environmentId: "env-prod" } },
  },
});
