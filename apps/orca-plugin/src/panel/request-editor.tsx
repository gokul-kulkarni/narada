import {
  Box,
  Button,
  Callout,
  KeyValue,
  Row,
  Select,
  Stack,
  Tab,
  Tabs,
  Text,
  Textarea,
  Input,
} from "orca";
import type { RequestSummary } from "../protocol";
import {
  draftFor,
  editDraft,
  editParams,
  isEdited,
  outcomeFor,
  paramsTextFor,
  resetDraft,
  send,
  stop,
} from "./state";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((m) => ({
  value: m,
  label: m,
}));

function bodyEditor(request: RequestSummary) {
  if (request.bodyMode === "raw") {
    return (
      <Textarea
        label="Body"
        labelHidden
        rows={8}
        value={draftFor(request).bodyText}
        onChange={(bodyText) => editDraft(request, { bodyText })}
      />
    );
  }
  if (request.bodyMode === "none") {
    return (
      <Text muted size="sm">
        This request has no body.
      </Text>
    );
  }
  return (
    <Stack gap="xs">
      <KeyValue
        label={request.bodyMode === "urlencoded" ? "Form fields (URL-encoded)" : "Form fields"}
        items={request.formFields.map(({ key, value }) => ({ label: key, value, code: true }))}
      />
      <Text muted size="xs">
        Form fields are sent as saved. Edit them in Narada.
      </Text>
    </Stack>
  );
}

export function requestEditor(request: RequestSummary) {
  const draft = draftFor(request);
  const sending = outcomeFor(request.key).kind === "sending";
  return (
    <Stack gap="sm">
      <Stack gap="none">
        <Text weight="semibold" truncate>
          {request.name}
        </Text>
        <Text muted size="xs" truncate>
          {request.location} · {request.authLabel}
        </Text>
      </Stack>
      <Row gap="xs" align="end">
        <Box width={112} shrink={false}>
          <Select
            label="Method"
            labelHidden
            value={draft.method}
            options={METHODS}
            onChange={(method) => editDraft(request, { method })}
          />
        </Box>
        <Box grow minWidth={0}>
          <Input
            label="URL"
            labelHidden
            value={draft.url}
            placeholder="https://api.example.com/items"
            onChange={(url) => editDraft(request, { url })}
            onSubmit={() => void send(request)}
          />
        </Box>
      </Row>
      <Tabs label="Request" defaultValue="params">
        <Tab value="params" label="Params">
          <Textarea
            label="Query parameters, one key=value per line"
            labelHidden
            rows={4}
            placeholder={"One key=value per line.\nStart a line with # to switch it off."}
            value={paramsTextFor(request)}
            onChange={(text) => editParams(request, text)}
          />
        </Tab>
        <Tab value="headers" label="Headers">
          <Textarea
            label="Headers, one Name: value per line"
            labelHidden
            rows={4}
            placeholder={"Accept: application/json\n# Authorization: switched off"}
            value={draft.headersText}
            onChange={(headersText) => editDraft(request, { headersText })}
          />
        </Tab>
        <Tab value="body" label="Body">
          {bodyEditor(request)}
        </Tab>
      </Tabs>
      {request.hasScripts ? (
        <Callout tone="neutral" icon="info">
          Pre-request and test scripts run only in the Narada app; they are skipped here.
        </Callout>
      ) : null}
      <Row gap="xs">
        {sending ? (
          <Button tone="danger" variant="outline" icon="stop" onPress={stop}>
            Stop
          </Button>
        ) : (
          <Button tone="accent" icon="play" onPress={() => void send(request)}>
            Send
          </Button>
        )}
        <Button variant="ghost" disabled={!isEdited(request)} onPress={() => resetDraft(request)}>
          Undo edits
        </Button>
      </Row>
    </Stack>
  );
}
