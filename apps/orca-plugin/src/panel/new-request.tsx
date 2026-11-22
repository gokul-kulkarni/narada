import { Button, Callout, Heading, Input, read, Row, Select, Stack, Text, Textarea } from "orca";
import type { WorkspaceSnapshot } from "../protocol";
import { closeComposer, composer, editComposer, saveComposer, TOP_LEVEL } from "./composer";

/** The form that turns a pasted cURL command into a saved request. */
export function newRequestForm(snapshot: WorkspaceSnapshot) {
  const form = read(composer);
  const collection = snapshot.collections.find((c) => c.id === form.collectionId);
  return (
    <Stack gap="sm">
      <Heading level={3}>New request from cURL</Heading>
      <Textarea
        label="cURL command"
        rows={5}
        placeholder={"curl https://api.example.com/items \\\n  -H 'Accept: application/json'"}
        value={form.curl}
        onChange={(curl) => editComposer({ curl })}
      />
      <Input
        label="Name"
        placeholder="Optional; e.g. GET /items"
        value={form.name}
        onChange={(name) => editComposer({ name })}
      />
      <Select
        label="Collection"
        value={form.collectionId}
        options={snapshot.collections.map((c) => ({ value: c.id, label: c.name }))}
        onChange={(collectionId) => editComposer({ collectionId, folderId: TOP_LEVEL })}
      />
      {collection && collection.folders.length > 0 ? (
        <Select
          label="Folder"
          value={form.folderId}
          options={[
            { value: TOP_LEVEL, label: "Top level" },
            ...collection.folders.map((f) => ({ value: f.id, label: f.label })),
          ]}
          onChange={(folderId) => editComposer({ folderId })}
        />
      ) : null}
      <Text muted size="xs">
        Saved in the collection file. If the Narada app is open, restart it before editing this
        collection there, or it will save over the new request.
      </Text>
      {form.error ? (
        <Callout tone="danger" icon="error" title="Not saved">
          {form.error}
        </Callout>
      ) : null}
      <Row gap="xs">
        <Button
          tone="accent"
          icon="add"
          disabled={form.saving || form.curl.trim() === "" || !collection}
          onPress={() => void saveComposer()}
        >
          {form.saving ? "Saving…" : "Save request"}
        </Button>
        <Button variant="ghost" onPress={closeComposer}>
          Cancel
        </Button>
      </Row>
    </Stack>
  );
}
