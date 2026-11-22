#!/usr/bin/env node
// Publishes the plugin to its release repository (gokul-kulkarni/narada-orca), which holds only
// what Orca installs: orca-plugin.json at the root, the panel sources and the worker bundle. The
// source of truth stays in this monorepo; Orca's directory needs a repository whose tagged tree is
// just the plugin (no desktop app, no binaries).
//
//   node scripts/release.mjs            # build, check, sync, commit, tag v<version>, push
//   node scripts/release.mjs --dry-run  # stop before committing; print what would change
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RELEASE_REPO = "https://github.com/gokul-kulkarni/narada-orca.git";
const pluginDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(pluginDir, "../..");
const dryRun = process.argv.includes("--dry-run");

/** What the release repository contains, relative to the plugin folder (plus the license). */
const RELEASED = ["orca-plugin.json", "README.md", ".gitattributes", "assets", "dist/worker.js", "src"];
const SKIPPED_IN_SRC = /\.(test|check)\.tsx?$|^fixtures$/;

const run = (cmd, args, cwd = pluginDir) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();

function fail(message) {
  console.error(`release: ${message}`);
  process.exit(1);
}

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIPPED_IN_SRC.test(entry.name)) continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else fs.copyFileSync(source, target);
  }
}

function checkSource() {
  if (run("git", ["status", "--porcelain", "--", "."]) !== "")
    fail("apps/orca-plugin has uncommitted changes; commit them first.");
  run("pnpm", ["build"]);
  run("pnpm", ["bundle:verify"]);
  run("orca", ["plugin", "validate", ".", "--json"]);
  if (run("git", ["status", "--porcelain", "--", "dist"]) !== "")
    fail("dist/worker.js changed when rebuilt; commit the new bundle first.");
}

function sync(checkout) {
  for (const entry of fs.readdirSync(checkout)) {
    if (entry !== ".git") fs.rmSync(path.join(checkout, entry), { recursive: true, force: true });
  }
  for (const item of RELEASED) {
    const source = path.join(pluginDir, item);
    const target = path.join(checkout, item);
    if (fs.statSync(source).isDirectory()) copyTree(source, target);
    else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    }
  }
  fs.copyFileSync(path.join(repoRoot, "LICENSE"), path.join(checkout, "LICENSE"));
}

const manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, "orca-plugin.json"), "utf8"));
const tag = `v${manifest.version}`;
const sourceCommit = run("git", ["rev-parse", "HEAD"]);

checkSource();
const checkout = fs.mkdtempSync(path.join(os.tmpdir(), "narada-orca-release-"));
run("git", ["clone", "--quiet", RELEASE_REPO, checkout]);
// A fresh release repository has no branch yet; releases always go to main.
run("git", ["checkout", "--quiet", "-B", "main"], checkout);
if (run("git", ["tag", "--list", tag], checkout) !== "")
  fail(`${tag} already exists in the release repository; bump "version" in orca-plugin.json.`);
sync(checkout);
run("git", ["add", "--all"], checkout);
console.log(run("git", ["status", "--short"], checkout) || "(no file changes)");
if (dryRun) {
  console.log(`dry run: would commit, tag ${tag} and push from ${checkout}`);
  process.exit(0);
}
run(
  "git",
  [
    "commit",
    "--quiet",
    "--allow-empty",
    "-m",
    `release: ${tag}\n\nFrom gokul-kulkarni/narada@${sourceCommit} (apps/orca-plugin).`,
  ],
  checkout,
);
run("git", ["tag", "-a", tag, "-m", tag], checkout);
run("git", ["push", "--quiet", "origin", "main", tag], checkout);
console.log(`released ${tag}: ${run("git", ["rev-parse", "HEAD"], checkout)}`);
fs.rmSync(checkout, { recursive: true, force: true });
