#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyDictionary, formatReport } from "./lib/apply.mjs";
import { parseArgs, requireArg } from "./lib/cli.mjs";
import { readJson } from "./lib/files.mjs";

const args = parseArgs(process.argv.slice(2));
const root = requireArg(args._[0] ?? args.src ?? process.env.UPSTREAM_DIR, "上游源码目录");
const overlayDir = path.dirname(fileURLToPath(import.meta.url));

const dictionary = readJson(path.join(overlayDir, "zh-CN.json"), { version: 1, entries: [] });
const config = readJson(path.join(overlayDir, "config.json"), {});
const sourceUrl = args["source-url"] ?? process.env.SOURCE_URL ?? config.sourceUrl ?? "";

const report = applyDictionary(root, dictionary, { config, sourceUrl });
console.log(formatReport(report));

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
}

if (
  args.strict &&
  (report.missing.length > 0 ||
    report.stale.length > 0 ||
    report.missingManualPatches.length > 0 ||
    report.structuralMissing.length > 0)
) {
  process.exit(1);
}
