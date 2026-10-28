import { toDictionaryEntry } from "./extract.mjs";
import { keyOf } from "./keys.mjs";

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
      entry.status === "stale" ||
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
