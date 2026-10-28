import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractEntries, normalizeText } from "./extract.mjs";
import { readJson } from "./files.mjs";
import { keyOf } from "./keys.mjs";

function quoteString(value, quote) {
  if (quote === '"') {
    return JSON.stringify(value);
  }

  if (quote === "'") {
    return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`;
  }

  if (quote === "`") {
    return `\`${value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${")}\``;
  }

  return JSON.stringify(value);
}

function replacementFor(entry, raw, target) {
  if (entry.kind === "jsString" || entry.kind === "jsxAttr" || entry.kind === "jsAttr" || entry.kind === "prop") {
    const quote = raw[0];
    return quoteString(target, quote);
  }

  if (entry.kind === "jsxText" || entry.kind === "htmlText" || entry.kind === "htmlAttr") {
    const leading = raw.match(/^\s*/)?.[0] ?? "";
    const trailing = raw.match(/\s*$/)?.[0] ?? "";
    return `${leading}${target}${trailing}`;
  }

  return target;
}

function applyReplacements(filePath, replacements) {
  let text = fs.readFileSync(filePath, "utf8");
  const sorted = [...replacements].sort((a, b) => b.start - a.start);
  let previousStart = Number.POSITIVE_INFINITY;

  for (const replacement of sorted) {
    if (replacement.end > previousStart) {
      throw new Error(
        `Overlapping replacements in ${filePath}: ${replacement.context} / ${replacement.source}`,
      );
    }
    text = `${text.slice(0, replacement.start)}${replacement.text}${text.slice(replacement.end)}`;
    previousStart = replacement.start;
  }

  fs.writeFileSync(filePath, text, "utf8");
}

function structuralPatches(rootDir, config, sourceUrl, report) {
  const baseFile = path.join(rootDir, "src/components/base.tsx");
  if (fs.existsSync(baseFile)) {
    let text = fs.readFileSync(baseFile, "utf8");
    const before = text;

    const hadLang = text.includes('<html lang="en">');
    text = text.replace(/<html lang="en">/g, `<html lang="${config.locale}">`);
    if (!hadLang && !text.includes(`<html lang="${config.locale}">`)) {
      report.structuralMissing.push("src/components/base.tsx: <html lang=\"en\">");
    }

    let footerMissing = false;
    if (sourceUrl && !text.includes("data-convertx-zh")) {
      const footer = [
        `  <div class="pb-2 text-center text-xs text-neutral-600" data-convertx-zh="1">`,
        `          <a href="${sourceUrl}" class="hover:text-accent-500" target="_blank" rel="noopener noreferrer">`,
        `            非官方简体中文汉化版 · 源码`,
        `          </a>`,
        `        </div>`,
        `      </footer>`,
      ].join("\n");
      if (text.includes("</footer>")) {
        text = text.replace(/<\/footer>/g, footer);
      } else {
        footerMissing = true;
      }
    }
    if (footerMissing) {
      report.structuralMissing.push("src/components/base.tsx: </footer>");
    }

    if (text !== before) {
      fs.writeFileSync(baseFile, text, "utf8");
      report.structural.push("src/components/base.tsx: lang + source footer");
    }
  }

  const envFile = path.join(rootDir, "src/helpers/env.ts");
  if (fs.existsSync(envFile)) {
    let text = fs.readFileSync(envFile, "utf8");
    const before = text;
    const languagePattern =
      /process\.env\.LANGUAGE\?\.toLowerCase\(\)\s*\|\|\s*["']en["']/;
    const hadLanguage = languagePattern.test(text);
    text = text.replace(
      languagePattern,
      `process.env.LANGUAGE?.toLowerCase() || "${config.defaultLanguage}"`,
    );
    if (!hadLanguage && !text.includes(`|| "${config.defaultLanguage}"`)) {
      report.structuralMissing.push(
        `src/helpers/env.ts: default LANGUAGE=${config.defaultLanguage}`,
      );
    }
    if (text !== before) {
      fs.writeFileSync(envFile, text, "utf8");
      report.structural.push(`src/helpers/env.ts: default LANGUAGE=${config.defaultLanguage}`);
    }
  }
}

function manualPatches(rootDir, report) {
  const patchFile = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../manual-patches.json",
  );
  const config = readJson(patchFile, { patches: [] });
  const applied = [];
  const missing = [];

  for (const patch of config.patches ?? []) {
    const target = path.join(rootDir, patch.file);
    if (!fs.existsSync(target)) {
      missing.push({ file: patch.file, find: patch.find, reason: "file missing" });
      continue;
    }

    const text = fs.readFileSync(target, "utf8");
    if (!text.includes(patch.find)) {
      missing.push({ file: patch.file, find: patch.find, reason: "find not found" });
      continue;
    }

    const count = text.split(patch.find).length - 1;
    fs.writeFileSync(target, text.split(patch.find).join(patch.replace), "utf8");
    applied.push({ file: patch.file, find: patch.find, count });
  }

  report.manualPatches = applied;
  report.missingManualPatches = missing;
}

export function applyDictionary(rootDir, dictionary, options = {}) {
  const { config = {}, sourceUrl = "" } = options;
  const entries = extractEntries(rootDir);
  const translated = new Map();

  for (const entry of dictionary.entries ?? []) {
    if (entry.status === "removed" || entry.status === "stale" || !normalizeText(entry.target ?? "")) {
      continue;
    }
    translated.set(keyOf(entry), entry.target);
  }

  const byFile = new Map();
  const missing = [];
  let applied = 0;

  for (const entry of entries) {
    const target = translated.get(keyOf(entry));
    if (!target) {
      missing.push({
        file: entry.file,
        context: entry.context,
        source: entry.source,
        occurrence: entry.occurrence,
        line: entry.line,
      });
      continue;
    }

    const filePath = path.join(rootDir, entry.file);
    const text = fs.readFileSync(filePath, "utf8");
    const raw = text.slice(entry.start, entry.end);
    const list = byFile.get(entry.file) ?? [];
    list.push({
      start: entry.start,
      end: entry.end,
      text: replacementFor(entry, raw, target),
      context: entry.context,
      source: entry.source,
    });
    byFile.set(entry.file, list);
    applied += 1;
  }

  for (const [file, replacements] of byFile) {
    applyReplacements(path.join(rootDir, file), replacements);
  }

  const extractedKeys = new Set(entries.map(keyOf));
  const stale = (dictionary.entries ?? [])
    .filter((entry) => entry.status !== "removed" && !extractedKeys.has(keyOf(entry)))
    .map((entry) => ({
      file: entry.file,
      context: entry.context,
      source: entry.source,
      occurrence: entry.occurrence,
    }));

  const report = {
    files: byFile.size,
    detected: entries.length,
    applied,
    missing,
    stale,
    manualPatches: [],
    missingManualPatches: [],
    structural: [],
    structuralMissing: [],
  };

  structuralPatches(rootDir, config, sourceUrl, report);
  manualPatches(rootDir, report);

  return report;
}

export function formatReport(report) {
  const lines = [
    `扫描文件: ${report.files}`,
    `检测文案: ${report.detected}`,
    `已应用翻译: ${report.applied}`,
    `未翻译: ${report.missing.length}`,
    `失效词条: ${report.stale.length}`,
  ];

  if (report.structural.length > 0) {
    lines.push(`结构补丁: ${report.structural.join("; ")}`);
  }

  if (report.structuralMissing.length > 0) {
    lines.push(`结构补丁缺失: ${report.structuralMissing.join("; ")}`);
  }

  if (report.manualPatches.length > 0) {
    lines.push(
      `手工补丁: ${report.manualPatches
        .map((item) => `${item.file} (${item.count})`)
        .join("; ")}`,
    );
  }

  if (report.missingManualPatches.length > 0) {
    lines.push(
      `手工补丁缺失: ${report.missingManualPatches
        .map((item) => `${item.file} (${item.reason})`)
        .join("; ")}`,
    );
  }

  if (report.missing.length > 0) {
    lines.push("", "未翻译文案:");
    for (const item of report.missing.slice(0, 50)) {
      lines.push(`- ${item.file}:${item.line} [${item.context}] ${item.source}`);
    }
    if (report.missing.length > 50) {
      lines.push(`- ... 还有 ${report.missing.length - 50} 条`);
    }
  }

  if (report.stale.length > 0) {
    lines.push("", "失效词条:");
    for (const item of report.stale.slice(0, 50)) {
      lines.push(`- ${item.file} [${item.context}] ${item.source}`);
    }
    if (report.stale.length > 50) {
      lines.push(`- ... 还有 ${report.stale.length - 50} 条`);
    }
  }

  return lines.join("\n");
}
