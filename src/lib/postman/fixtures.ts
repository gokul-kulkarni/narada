/** Trimmed real-world shape of a Postman v2.1 export. */
export const POSTMAN_COLLECTION = {
  info: {
    _postman_id: "8b1c5a54-0000-4000-8000-000000000001",
    name: "Pet Store",
    description: "Demo API",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  auth: { type: "bearer", bearer: [{ key: "token", value: "{{token}}", type: "string" }] },
  variable: [
    { key: "baseUrl", value: "https://petstore.dev", type: "string" },
    { key: "unused", value: "x", disabled: true },
  ],
  event: [
    { listen: "prerequest", script: { type: "text/javascript", exec: ["console.log('c');"] } },
  ],
  item: [
    {
      name: "Pets",
      auth: { type: "noauth" },
      item: [
        {
          id: "req-list",
          name: "List pets",
          event: [
            {
              listen: "test",
              script: {
                exec: ["pm.test('ok', () => {", "  pm.response.to.have.status(200);", "});"],
              },
            },
          ],
          request: {
            method: "GET",
            header: [
              { key: "Accept", value: "application/json" },
              { key: "X-Off", value: "1", disabled: true },
            ],
            url: {
              raw: "{{baseUrl}}/pets?limit=10",
              host: ["{{baseUrl}}"],
              path: ["pets"],
              query: [{ key: "limit", value: "10" }],
            },
          },
        },
      ],
    },
    {
      name: "Create pet",
      request: {
        method: "POST",
        auth: {
          type: "apikey",
          apikey: [
            { key: "key", value: "X-Api-Key" },
            { key: "value", value: "{{apiKey}}" },
            { key: "in", value: "header" },
          ],
        },
        body: { mode: "raw", raw: '{"name":"Rex"}', options: { raw: { language: "json" } } },
        url: "{{baseUrl}}/pets",
      },
    },
    {
      name: "Login",
      request: {
        method: "POST",
        auth: {
          type: "basic",
          basic: [
            { key: "username", value: "ada" },
            { key: "password", value: "pw" },
          ],
        },
        body: {
          mode: "urlencoded",
          urlencoded: [
            { key: "grant", value: "password" },
            { key: "off", value: "1", disabled: true },
          ],
        },
        url: { raw: "{{baseUrl}}/login" },
      },
    },
    {
      name: "Upload",
      request: {
        method: "PUT",
        body: { mode: "formdata", formdata: [{ key: "title", value: "a", type: "text" }] },
        url: "{{baseUrl}}/upload",
      },
    },
  ],
};

export const POSTMAN_ENVIRONMENT = {
  id: "5d1f0000-0000-4000-8000-000000000002",
  name: "Staging",
  values: [
    { key: "baseUrl", value: "https://staging.dev", type: "default", enabled: true },
    { key: "token", value: "s3cret", type: "secret", enabled: true },
    { key: "old", value: "1", enabled: false },
  ],
  _postman_variable_scope: "environment",
};
