#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs, requireArg } from "./lib/cli.mjs";
import { formatSyncReport, syncDictionary } from "./lib/dictionary.mjs";
import { extractEntries } from "./lib/extract.mjs";
import { readJson, writeJson } from "./lib/files.mjs";

const args = parseArgs(process.argv.slice(2));
const root = requireArg(args._[0] ?? args.src ?? process.env.UPSTREAM_DIR, "上游源码目录");
const version = requireArg(args.version ?? process.env.UPSTREAM_VERSION, "上游版本，例如 v0.19.0");
const overlayDir = path.dirname(fileURLToPath(import.meta.url));

const upstreamPath = path.join(overlayDir, "upstream.json");
const dictionaryPath = path.join(overlayDir, "zh-CN.json");
const reportPath = path.join(overlayDir, "sync-report.md");

const upstream = readJson(upstreamPath, {
  repo: "C4illin/ConvertX",
  version: "v0.19.0",
  baseImage: "ghcr.io/c4illin/convertx:v0.19.0",
});
const dictionary = readJson(dictionaryPath, { version: 1, entries: [] });
const baseImage = args["base-image"] ?? `ghcr.io/c4illin/convertx:${version}`;

const extracted = extractEntries(root);
const { dictionary: nextDictionary, stats } = syncDictionary(extracted, dictionary);
const todoEntries = nextDictionary.entries.filter(
  (entry) => entry.status !== "removed" && !(entry.target ?? "").trim(),
);

writeJson(dictionaryPath, nextDictionary);
writeJson(upstreamPath, {
  repo: args.repo ?? upstream.repo ?? "C4illin/ConvertX",
  version,
  baseImage,
});
fs.writeFileSync(
  reportPath,
  formatSyncReport(stats, todoEntries, version, baseImage),
  "utf8",
);

console.log(
  [
    `上游版本: ${version}`,
    `检测文案: ${stats.detected}`,
    `新增: ${stats.added}`,
    `恢复: ${stats.restored}`,
    `移除: ${stats.removed}`,
    `已翻译: ${stats.translated}`,
    `待翻译: ${stats.todo}`,
    `词典: ${dictionaryPath}`,
    `报告: ${reportPath}`,
  ].join("\n"),
);

if (todoEntries.length > 0) {
  const preview = todoEntries
    .slice(0, 30)
    .map((entry) => `- ${entry.file} [${entry.context}#${entry.occurrence}] ${entry.source}`);
  console.log(["", "待翻译预览:", ...preview].join("\n"));
}
