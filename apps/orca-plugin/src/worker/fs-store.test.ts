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

test("lists documents sorted and reads local files", async () => {
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
  await fs.rm(root, { recursive: true, force: true });
});

test("writes collection files whole, and nothing else", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "narada-store-"));
  await fs.mkdir(path.join(root, "Collections"));
  await fs.writeFile(path.join(root, "Collections", "a.json"), "old");
  const store = createFsDocumentStore(root, root);

  await store.write("collections", "a.json", "new");
  assert.equal(await fs.readFile(path.join(root, "Collections", "a.json"), "utf8"), "new");
  // No temporary file is left next to it.
  assert.deepEqual(await fs.readdir(path.join(root, "Collections")), ["a.json"]);

  await assert.rejects(store.write("collections", "../x.json", "{}"), /not a collection file/);
  await assert.rejects(store.write("environments", "e.json", "{}"), /only adds requests/);
  await assert.rejects(store.remove("collections", "a.json"), /only adds requests/);
  await assert.rejects(store.writeLocal("globals.json", "[]"), /only adds requests/);
  await fs.rm(root, { recursive: true, force: true });
});
