// Sample worker answers for panel tests and `orca plugin check` scenarios.
import type { ResponseSummary, WorkspaceSnapshot } from "../protocol";

const LIST = "r:col-1:req-list";
const CREATE = "r:col-1:req-create";

export const SNAPSHOT: WorkspaceSnapshot = {
  folder: { path: "/Users/me/Narada", source: "desktop", exists: true },
  tree: [
    {
      key: "c:col-1",
      label: "Shop API",
      icon: "folder",
      children: [
        {
          key: "f:col-1:orders",
          label: "Orders",
          icon: "folder",
          children: [
            { key: LIST, label: "List orders", description: "GET", icon: "globe" },
            { key: CREATE, label: "Create order", description: "POST", icon: "globe" },
          ],
        },
        {
          key: "r:col-1:mcp",
          label: "Search docs",
          description: "MCP: open in Narada",
          icon: "plug",
          disabled: true,
        },
      ],
    },
  ],
  requests: {
    [LIST]: {
      key: LIST,
      collectionId: "col-1",
      requestId: "req-list",
      name: "List orders",
      location: "Shop API / Orders",
      method: "GET",
      url: "{{base}}/orders?limit=20",
      headersText: "Accept: application/json",
      bodyMode: "none",
      bodyText: "",
      formFields: [],
      authLabel: "Bearer token, from the collection",
      hasScripts: false,
    },
    [CREATE]: {
      key: CREATE,
      collectionId: "col-1",
      requestId: "req-create",
      name: "Create order",
      location: "Shop API / Orders",
      method: "POST",
      url: "{{base}}/orders",
      headersText: "",
      bodyMode: "raw",
      bodyText: '{\n  "sku": "{{sku}}"\n}',
      formFields: [],
      authLabel: "Bearer token, from the collection",
      hasScripts: true,
    },
  },
  environments: [
    { id: "env-local", name: "Local", missingSecrets: [] },
    { id: "env-prod", name: "Production", missingSecrets: ["token"] },
  ],
  errors: [],
};

export const KEYS = { list: LIST, create: CREATE };

export const RESPONSE: ResponseSummary = {
  status: 200,
  statusText: "OK",
  timeMs: 142,
  sizeBytes: 182,
  timingLabel: "142 ms · 182 B",
  headers: [
    ["content-type", "application/json"],
    ["x-request-id", "7f3a"],
  ],
  contentType: "application/json",
  preview:
    '{\n  "orders": [\n    { "id": 7, "sku": "A-1", "status": "shipped" }\n  ],\n  "next": null\n}',
  previewTruncated: false,
  body: '{"orders":[{"id":7,"sku":"A-1","status":"shipped"}],"next":null}',
  bodyTruncated: false,
  incomplete: null,
  sentUrl: "https://api.example.com/orders?limit=20",
};
