import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assert, test } from "orca/testing";
import { createFsDocumentStore, isDocumentName } from "./fs-store";

test("accepts only plain .json names", () => {
  assert.ok(isDocumentName("shop.postman_collection.json"));
  for (const bad of ["", ".hidden.json", "a..json", "../x.json", "a b.json", "notes.txt"]) {
    assert.equal(isDocumentName(bad), false, bad);
  }
});

test("lists documents sorted, reads local files and refuses writes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "narada-store-"));
  await fs.mkdir(path.join(root, "Collections"));
  await fs.writeFile(path.join(root, "Collections", "b.json"), "B");
  await fs.writeFile(path.join(root, "Collections", "a.json"), "A");
  await fs.writeFile(path.join(root, "Collections", "skip.txt"), "x");
  await fs.writeFile(path.join(root, "globals.json"), "[]");
  const store = createFsDocumentStore(root, root);

  assert.deepEqual(await store.list("collections"), [
    { fileName: "a.json", content: "A" },
    { fileName: "b.json", content: "B" },
  ]);
  assert.deepEqual(await store.list("environments"), []);
  assert.equal(await store.readLocal("globals.json"), "[]");
  assert.equal(await store.readLocal("history.json"), null);
  await assert.rejects(store.write("collections", "c.json", "{}"), /only reads/);
  await assert.rejects(store.remove("collections", "a.json"), /only reads/);
  await fs.rm(root, { recursive: true, force: true });
});
