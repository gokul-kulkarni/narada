import {
  Badge,
  Button,
  Callout,
  CodeView,
  files,
  KeyValue,
  Row,
  Spinner,
  Stack,
  Tab,
  Tabs,
  Text,
  type Tone,
} from "orca";
import type { ResponseSummary } from "../protocol";
import type { SendState } from "./state";

export function statusTone(status: number): Tone {
  if (status >= 500) return "danger";
  if (status >= 400) return "warning";
  if (status >= 300) return "accent";
  return "success";
}

function languageOf(contentType: string): string | undefined {
  if (contentType.includes("json")) return "json";
  if (contentType.includes("html")) return "html";
  if (contentType.includes("xml")) return "xml";
  return undefined;
}

function extensionOf(contentType: string): string {
  return languageOf(contentType) ?? "txt";
}

function saveBody(response: ResponseSummary): void {
  void files.saveAs({
    suggestedName: `response.${extensionOf(response.contentType)}`,
    mimeType: response.contentType.split(";")[0] || "text/plain",
    data: response.body,
  });
}

function responseDetails(response: ResponseSummary) {
  return (
    <Stack gap="sm">
      <Row gap="xs" align="center">
        <Badge tone={statusTone(response.status)}>
          {`${response.status} ${response.statusText}`.trim()}
        </Badge>
        <Text muted size="xs">
          {response.timingLabel}
        </Text>
      </Row>
      {response.incomplete ? (
        <Callout tone="warning" icon="warning">
          {response.incomplete}
        </Callout>
      ) : null}
      <Tabs label="Response" defaultValue="body">
        <Tab value="body" label="Body">
          <Stack gap="xs">
            {response.preview === "" ? (
              <Text muted size="sm">
                Empty body.
              </Text>
            ) : (
              <CodeView
                label="Response body"
                code={response.preview}
                language={languageOf(response.contentType)}
                wrap
                maxHeight="lg"
              />
            )}
            <Row gap="xs" align="center" justify="between">
              <Text muted size="xs">
                {response.previewTruncated
                  ? "Showing the start of the body."
                  : response.bodyTruncated
                    ? "Body is larger than the panel can hold."
                    : ""}
              </Text>
              <Button
                size="sm"
                variant="ghost"
                icon="download"
                disabled={response.body === ""}
                onPress={() => saveBody(response)}
              >
                {response.bodyTruncated ? "Save first 400 KB" : "Save body"}
              </Button>
            </Row>
          </Stack>
        </Tab>
        <Tab value="headers" label={`Headers (${response.headers.length})`}>
          <KeyValue
            label="Response headers"
            items={response.headers.map(([label, value]) => ({ label, value, code: true }))}
          />
        </Tab>
      </Tabs>
      <Text muted size="xs" truncate>
        Sent to {response.sentUrl}
      </Text>
    </Stack>
  );
}

export function responseView(outcome: SendState) {
  switch (outcome.kind) {
    case "idle":
      return null;
    case "sending":
      return <Spinner label="Waiting for the response" />;
    case "failed":
      return (
        <Callout tone="danger" icon="error" title="Request failed">
          {outcome.error}
        </Callout>
      );
    case "done":
      return responseDetails(outcome.response);
  }
}
