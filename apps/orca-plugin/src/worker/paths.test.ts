import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assert, test } from "orca/testing";
import { desktopDirs, resolveFolder } from "./paths";

test("finds the desktop app's folders on each platform", () => {
  assert.deepEqual(desktopDirs({ platform: "darwin", home: "/Users/a", env: {} }), {
    dataDir: "/Users/a/Library/Application Support/com.narada.app",
    configDir: "/Users/a/Library/Application Support/com.narada.app",
  });
  assert.deepEqual(desktopDirs({ platform: "linux", home: "/home/a", env: {} }), {
    dataDir: "/home/a/.local/share/com.narada.app",
    configDir: "/home/a/.config/com.narada.app",
  });
  assert.deepEqual(
    desktopDirs({
      platform: "linux",
      home: "/home/a",
      env: { XDG_DATA_HOME: "/d", XDG_CONFIG_HOME: "/c" },
    }),
    { dataDir: "/d/com.narada.app", configDir: "/c/com.narada.app" },
  );
  assert.equal(
    desktopDirs({ platform: "win32", home: "C:\\Users\\a", env: { APPDATA: "/appdata" } }).dataDir,
    path.join("/appdata", "com.narada.app"),
  );
});

test("prefers the plugin setting, then the desktop setting, then the default", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "narada-paths-"));
  const dirs = { dataDir: path.join(tmp, "data"), configDir: path.join(tmp, "config") };
  const chosen = path.join(tmp, "chosen");
  await fs.mkdir(path.join(chosen, "Collections"), { recursive: true });

  assert.deepEqual(await resolveFolder(null, dirs, tmp), {
    path: path.join(dirs.dataDir, "workspace"),
    source: "default",
    exists: false,
  });

  await fs.mkdir(dirs.configDir, { recursive: true });
  await fs.writeFile(
    path.join(dirs.configDir, "settings.json"),
    JSON.stringify({ storageDir: chosen }),
  );
  assert.deepEqual(await resolveFolder("  ", dirs, tmp), {
    path: chosen,
    source: "desktop",
    exists: true,
  });

  assert.deepEqual(await resolveFolder("~/chosen", dirs, tmp), {
    path: chosen,
    source: "setting",
    exists: true,
  });

  await fs.writeFile(path.join(dirs.configDir, "settings.json"), "{broken");
  assert.equal((await resolveFolder(null, dirs, tmp)).source, "default");
  await fs.rm(tmp, { recursive: true, force: true });
});
