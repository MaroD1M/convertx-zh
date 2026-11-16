#!/usr/bin/env node
/**
 * 只提取上游源码中的界面文案，不读写词典。
 *
 * 用法：
 *   node zh/extract.mjs /path/to/upstream
 *   node zh/extract.mjs /path/to/upstream --out /tmp/entries.json
 *
 * 主要用于调试提取规则和审查覆盖率。
 */
import path from "node:path";

import { parseArgs, requireArg } from "./lib/cli.mjs";
import { extractEntries } from "./lib/extract.mjs";
import { writeJson } from "./lib/files.mjs";

const args = parseArgs(process.argv.slice(2));
const root = requireArg(args._[0] ?? args.src ?? process.env.UPSTREAM_DIR, "上游源码目录");

const entries = extractEntries(root).map(({ start, end, ...entry }) => entry);
const result = { count: entries.length, entries };

if (args.out) {
  const output = path.resolve(args.out);
  writeJson(output, result);
  console.log(`已提取 ${entries.length} 条文案 -> ${output}`);
} else {
  console.log(JSON.stringify(result, null, 2));
}
