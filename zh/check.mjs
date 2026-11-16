#!/usr/bin/env node
/**
 * 检查词典是否完整覆盖当前上游源码。
 *
 * 用法：
 *   node zh/check.mjs /path/to/upstream
 *   node zh/check.mjs /path/to/upstream --strict
 *
 * 只读操作，不会修改任何文件。`--strict` 下发现缺失、失效或重复词条
 * 时以非零状态退出。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs, requireArg } from "./lib/cli.mjs";
import { checkDictionary, formatCheck } from "./lib/dictionary.mjs";
import { extractEntries } from "./lib/extract.mjs";
import { readJson } from "./lib/files.mjs";

const args = parseArgs(process.argv.slice(2));
const root = requireArg(args._[0] ?? args.src ?? process.env.UPSTREAM_DIR, "上游源码目录");
const overlayDir = path.dirname(fileURLToPath(import.meta.url));

const dictionary = readJson(path.join(overlayDir, "zh-CN.json"), { version: 1, entries: [] });
const result = checkDictionary(extractEntries(root), dictionary);

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(formatCheck(result));
}

if (args.strict && !result.ok) {
  process.exit(1);
}
