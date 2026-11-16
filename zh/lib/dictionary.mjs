import { toDictionaryEntry } from "./extract.mjs";
import { keyOf } from "./keys.mjs";

/**
 * 词典同步与校验。
 *
 * `zh/zh-CN.json` 是唯一的人工翻译来源。条目状态只有三种：
 * - `todo`：已从上游提取，但还没有中文译文；
 * - `translated`：已有中文译文，可被 `apply.mjs` 应用；
 * - `removed`：上游已删除该文案，保留记录以便上游恢复时自动复活。
 *
 * `removed` 条目不会删除，避免上游短暂改动导致人工翻译丢失。
 */

/**
 * 稳定排序，保证 `sync.mjs` 生成的词典 diff 可读。
 *
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
function compareEntries(a, b) {
  if (a.file !== b.file) {
    return a.file.localeCompare(b.file);
  }
  if (a.context !== b.context) {
    return a.context.localeCompare(b.context);
  }
  if (a.source !== b.source) {
    return a.source.localeCompare(b.source);
  }
  return a.occurrence - b.occurrence;
}

/**
 * 将最新提取结果合并进现有词典。
 *
 * 合并规则：
 * - 已存在的词条保留人工译文；
 * - 新词条以 `todo` 加入；
 * - 上游消失的词条标记为 `removed`，而不是删除；
 * - 曾经 `removed`、现在又出现的词条恢复为 `todo`。
 *
 * @param {object[]} extracted `extractEntries()` 的结果
 * @param {{entries?: object[]}} dictionary 现有词典
 * @returns {{dictionary: object, stats: object}}
 */
export function syncDictionary(extracted, dictionary) {
  const existing = new Map((dictionary.entries ?? []).map((entry) => [keyOf(entry), entry]));
  const extractedKeys = new Set();
  const entries = [];
  let added = 0;
  let restored = 0;

  for (const item of extracted) {
    const key = keyOf(item);
    extractedKeys.add(key);
    const old = existing.get(key);

    if (old) {
      entries.push({
        ...old,
        file: item.file,
        context: item.context,
        source: item.source,
        occurrence: item.occurrence,
        status: old.status === "removed" ? "todo" : old.status,
      });
      if (old.status === "removed") {
        restored += 1;
      }
      continue;
    }

    entries.push(toDictionaryEntry(item));
    added += 1;
  }

  let removed = 0;
  for (const old of existing.values()) {
    if (!extractedKeys.has(keyOf(old))) {
      if (old.status !== "removed") {
        removed += 1;
      }
      entries.push({ ...old, status: "removed" });
    }
  }

  entries.sort(compareEntries);

  const todo = entries.filter(
    (entry) => entry.status !== "removed" && !(entry.target ?? "").trim(),
  ).length;
  const translated = entries.filter(
    (entry) => entry.status !== "removed" && (entry.target ?? "").trim(),
  ).length;

  return {
    dictionary: { version: 1, entries },
    stats: {
      detected: extracted.length,
      added,
      restored,
      removed,
      todo,
      translated,
      total: entries.length,
    },
  };
}

/**
 * 严格校验词典覆盖率。
 *
 * 检查三类问题：
 * - `missing`：源码里有文案，但词典没有译文；
 * - `stale`：词典有条目，但源码里已经不存在；
 * - `duplicates`：同一个 key 出现多次。
 *
 * 任意一类非空都会让 CI 失败（`strict` 模式）。
 *
 * @param {object[]} extracted
 * @param {{entries?: object[]}} dictionary
 * @returns {{detected: number, missing: object[], stale: object[], duplicates: object[], ok: boolean}}
 */
export function checkDictionary(extracted, dictionary) {
  const entries = dictionary.entries ?? [];
  const byKey = new Map(entries.map((entry) => [keyOf(entry), entry]));
  const extractedKeys = new Set(extracted.map(keyOf));

  const missing = [];
  for (const item of extracted) {
    const entry = byKey.get(keyOf(item));
    if (
      !entry ||
      entry.status === "removed" ||
      !(entry.target ?? "").trim()
    ) {
      missing.push(item);
    }
  }

  const stale = entries.filter(
    (entry) => entry.status !== "removed" && !extractedKeys.has(keyOf(entry)),
  );

  const duplicates = [];
  const seen = new Set();
  for (const entry of entries) {
    const key = keyOf(entry);
    if (seen.has(key)) {
      duplicates.push(entry);
    }
    seen.add(key);
  }

  return {
    detected: extracted.length,
    missing,
    stale,
    duplicates,
    ok: missing.length === 0 && stale.length === 0 && duplicates.length === 0,
  };
}

/**
 * 把校验结果格式化为适合 CI 日志阅读的文本。
 *
 * @param {ReturnType<typeof checkDictionary>} result
 * @returns {string}
 */
export function formatCheck(result) {
  const lines = [
    `检测文案: ${result.detected}`,
    `未翻译/缺失: ${result.missing.length}`,
    `失效词条: ${result.stale.length}`,
    `重复词条: ${result.duplicates.length}`,
  ];

  if (result.missing.length > 0) {
    lines.push("", "未翻译/缺失:");
    for (const item of result.missing.slice(0, 80)) {
      lines.push(`- ${item.file}:${item.line} [${item.context}#${item.occurrence}] ${item.source}`);
    }
    if (result.missing.length > 80) {
      lines.push(`- ... 还有 ${result.missing.length - 80} 条`);
    }
  }

  if (result.stale.length > 0) {
    lines.push("", "失效词条:");
    for (const item of result.stale.slice(0, 80)) {
      lines.push(`- ${item.file} [${item.context}#${item.occurrence}] ${item.source}`);
    }
    if (result.stale.length > 80) {
      lines.push(`- ... 还有 ${result.stale.length - 80} 条`);
    }
  }

  if (result.duplicates.length > 0) {
    lines.push("", "重复词条:");
    for (const item of result.duplicates.slice(0, 80)) {
      lines.push(`- ${item.file} [${item.context}#${item.occurrence}] ${item.source}`);
    }
  }

  return lines.join("\n");
}

/**
 * 生成 `zh/sync-report.md`，供同步 PR 审阅者快速查看新增文案。
 *
 * 最多列出 300 条，避免报告过长；完整内容始终以词典为准。
 *
 * @param {object} stats `syncDictionary()` 返回的统计
 * @param {object[]} todoEntries 待翻译条目
 * @param {string} version 上游版本
 * @param {string} baseImage 基础镜像
 * @returns {string}
 */
export function formatSyncReport(stats, todoEntries, version, baseImage) {
  const lines = [
    "# 上游同步报告",
    "",
    `- 上游版本: \`${version}\``,
    `- 基础镜像: \`${baseImage}\``,
    `- 检测文案: ${stats.detected}`,
    `- 新增: ${stats.added}`,
    `- 恢复: ${stats.restored}`,
    `- 移除: ${stats.removed}`,
    `- 已翻译: ${stats.translated}`,
    `- 待翻译: ${stats.todo}`,
    "",
  ];

  if (todoEntries.length === 0) {
    lines.push("本版本没有新增待翻译文案。");
    return `${lines.join("\n")}\n`;
  }

  lines.push("## 待翻译文案", "", "| 文件 | 上下文 | 原文 |", "| --- | --- | --- |");
  for (const entry of todoEntries.slice(0, 300)) {
    const source = entry.source.replace(/\|/g, "\\|");
    lines.push(`| \`${entry.file}\` | \`${entry.context}#${entry.occurrence}\` | ${source} |`);
  }
  if (todoEntries.length > 300) {
    lines.push("", `还有 ${todoEntries.length - 300} 条，请在 \`zh/zh-CN.json\` 中查看。`);
  }

  return `${lines.join("\n")}\n`;
}
