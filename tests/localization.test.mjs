import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { applyDictionary } from "../zh/lib/apply.mjs";
import { checkDictionary, syncDictionary } from "../zh/lib/dictionary.mjs";
import { extractEntries, toDictionaryEntry } from "../zh/lib/extract.mjs";
import { keyOf } from "../zh/lib/keys.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "fixtures/sample");

function copyFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "convertx-zh-test-"));
  fs.cpSync(fixture, dir, { recursive: true });
  return dir;
}

function translatedDictionary(extracted, prefix = "译:") {
  return {
    version: 1,
    entries: extracted.map((entry) => ({
      ...toDictionaryEntry(entry),
      target: `${prefix}${entry.source}`,
      status: "translated",
    })),
  };
}

test("extracts UI strings and skips template expressions", () => {
  const entries = extractEntries(fixture);
  const sources = new Set(entries.map((entry) => entry.source));

  assert.ok(sources.has("Convert"));
  assert.ok(sources.has("Choose a file"));
  assert.ok(sources.has("or drag it here"));
  assert.ok(sources.has("Search for conversions"));
  assert.ok(sources.has("Convert to"));
  assert.ok(sources.has("Select all"));
  assert.ok(sources.has("Powered by"));
  assert.ok(sources.has("Remove"));
  assert.ok(sources.has("Uploading..."));

  for (const entry of entries) {
    assert.ok(!entry.source.includes("${"), `unexpected template text: ${entry.source}`);
  }

  assert.ok(!sources.has("file.name"));
  assert.ok(!sources.has("using"));
  assert.ok(!sources.has("when the user clears the search bar using the 'x' button"));
});

test("applies dictionary entries, structural patches and manual patches", () => {
  const dir = copyFixture();
  const extracted = extractEntries(dir);
  const dictionary = translatedDictionary(extracted);

  const report = applyDictionary(dir, dictionary, {
    config: { locale: "zh-CN", defaultLanguage: "zh" },
    sourceUrl: "https://example.com/convertx-zh",
  });

  assert.equal(report.detected, extracted.length);
  assert.equal(report.applied, extracted.length);
  assert.equal(report.missing.length, 0);
  assert.equal(report.stale.length, 0);
  assert.deepEqual(report.missingManualPatches, []);
  assert.deepEqual(report.structuralMissing, []);

  const base = fs.readFileSync(path.join(dir, "src/components/base.tsx"), "utf8");
  assert.match(base, /<html lang="zh-CN">/);
  assert.match(base, /data-convertx-zh="1"/);
  assert.match(base, /https:\/\/example\.com\/convertx-zh/);
  assert.match(base, /非官方简体中文汉化版 · 源码/);
  assert.match(base, /译:Powered by/);

  const env = fs.readFileSync(path.join(dir, "src/helpers/env.ts"), "utf8");
  assert.match(env, /\|\| "zh"/);

  const root = fs.readFileSync(path.join(dir, "src/pages/root.tsx"), "utf8");
  assert.match(root, /译:Convert/);
  assert.match(root, /译:Choose a file/);
  assert.match(root, /译:Convert to/);

  const results = fs.readFileSync(path.join(dir, "src/pages/results.tsx"), "utf8");
  assert.match(results, /Done: "完成"/);
  assert.ok(!results.includes("<td safe>{file.status}</td>"));

  const history = fs.readFileSync(path.join(dir, "src/pages/history.tsx"), "utf8");
  assert.match(history, /pending: "处理中"/);
  assert.match(history, /确定要删除/);
  assert.match(history, /个任务吗/);
  assert.match(history, /删除任务失败，请重试。/);
  assert.match(history, /删除任务时出错，请重试。/);
  assert.ok(!history.includes("Are you sure you want to delete"));

  const script = fs.readFileSync(path.join(dir, "public/script.js"), "utf8");
  assert.match(script, /译:Remove/);
  assert.match(script, /译:Uploading/);
  assert.match(script, /`转换 \$\{/);
  assert.match(script, /\$\{target\.dataset\.target\} 使用 \$\{target\.dataset\.converter\}/);
  assert.match(script, /when the user clears the search bar using the 'x' button/);
});

test("reports manual and structural patch drift", () => {
  const dir = copyFixture();
  const historyPath = path.join(dir, "src/pages/history.tsx");
  fs.writeFileSync(
    historyPath,
    fs.readFileSync(historyPath, "utf8").replace("Are you sure you want to delete ", "Delete "),
  );

  const basePath = path.join(dir, "src/components/base.tsx");
  fs.writeFileSync(basePath, fs.readFileSync(basePath, "utf8").replace('<html lang="en">', "<html>"));

  const envPath = path.join(dir, "src/helpers/env.ts");
  fs.writeFileSync(
    envPath,
    fs
      .readFileSync(envPath, "utf8")
      .replace('process.env.LANGUAGE?.toLowerCase() || "en"', 'process.env.LANGUAGE || "en"'),
  );

  const extracted = extractEntries(dir);
  const report = applyDictionary(dir, translatedDictionary(extracted), {
    config: { locale: "zh-CN", defaultLanguage: "zh" },
    sourceUrl: "https://example.com/convertx-zh",
  });

  assert.ok(
    report.missingManualPatches.some((patch) => patch.find === "Are you sure you want to delete "),
  );
  assert.ok(
    report.structuralMissing.some((item) => item.includes("src/components/base.tsx")),
  );
  assert.ok(report.structuralMissing.some((item) => item.includes("src/helpers/env.ts")));
});

test("sync adds, removes and restores entries", () => {
  const extracted = extractEntries(fixture);
  const empty = { version: 1, entries: [] };
  const first = syncDictionary(extracted, empty);

  assert.equal(first.stats.added, extracted.length);
  assert.equal(first.stats.todo, extracted.length);
  assert.equal(first.stats.translated, 0);

  const translated = {
    version: 1,
    entries: first.dictionary.entries.map((entry) => ({
      ...entry,
      target: `译:${entry.source}`,
      status: "translated",
    })),
  };
  const fake = {
    ...toDictionaryEntry(extracted[0]),
    file: "src/pages/gone.tsx",
    context: "jsx:h1",
    source: "Removed upstream copy",
    occurrence: 1,
    target: "已删除文案",
    status: "translated",
  };
  translated.entries.push(fake);

  const second = syncDictionary(extracted, translated);
  const removed = second.dictionary.entries.find((entry) => keyOf(entry) === keyOf(fake));
  assert.equal(second.stats.removed, 1);
  assert.equal(removed.status, "removed");

  const removedInput = {
    version: 1,
    entries: translated.entries.map((entry) =>
      keyOf(entry) === keyOf(translated.entries[0]) ? { ...entry, status: "removed" } : entry,
    ),
  };
  const restored = syncDictionary(extracted, removedInput);
  assert.equal(restored.stats.restored, 1);
  const restoredEntry = restored.dictionary.entries.find(
    (entry) => keyOf(entry) === keyOf(translated.entries[0]),
  );
  assert.equal(restoredEntry.status, "todo");
  assert.equal(
    restored.dictionary.entries.find((entry) => keyOf(entry) === keyOf(fake)).status,
    "removed",
  );
});

test("check reports missing, stale, duplicate and passes when complete", () => {
  const extracted = extractEntries(fixture);
  const { dictionary } = syncDictionary(extracted, { version: 1, entries: [] });
  const translated = {
    version: 1,
    entries: dictionary.entries.map((entry) => ({
      ...entry,
      target: `译:${entry.source}`,
      status: "translated",
    })),
  };

  const ok = checkDictionary(extracted, translated);
  assert.equal(ok.ok, true);
  assert.equal(ok.missing.length, 0);
  assert.equal(ok.stale.length, 0);
  assert.equal(ok.duplicates.length, 0);

  const missing = {
    version: 1,
    entries: translated.entries.map((entry, index) =>
      index === 0 ? { ...entry, target: "" } : entry,
    ),
  };
  const missingResult = checkDictionary(extracted, missing);
  assert.equal(missingResult.ok, false);
  assert.equal(missingResult.missing.length, 1);

  const staleEntry = {
    ...toDictionaryEntry(extracted[0]),
    file: "src/pages/gone.tsx",
    source: "No longer exists",
    target: "已删除",
    status: "translated",
  };
  const stale = { version: 1, entries: [...translated.entries, staleEntry] };
  const staleResult = checkDictionary(extracted, stale);
  assert.equal(staleResult.ok, false);
  assert.equal(staleResult.stale.length, 1);

  const duplicate = {
    version: 1,
    entries: [...translated.entries, { ...translated.entries[0] }],
  };
  const duplicateResult = checkDictionary(extracted, duplicate);
  assert.equal(duplicateResult.ok, false);
  assert.equal(duplicateResult.duplicates.length, 1);
});
