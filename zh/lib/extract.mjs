import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

import { listSourceFiles, relativeFile } from "./files.mjs";

/**
 * 从上游 TSX/TS/JS 中提取界面文案。
 *
 * 这是一个面向 ConvertX 的启发式提取器，不是通用 i18n 解析器：
 * - 提取 JSX 文本、常用 UI 属性、`message` 属性；
 * - 提取 `public/*.js` 中的 textContent、innerHTML、alert、confirm、prompt；
 * - 跳过 URL、CSS、模板表达式和代码片段，避免把 `${...}` 当成文案。
 *
 * 同一文件、同一上下文、同一原文的多次出现通过 `occurrence` 区分。
 * 这样即使同一页面重复出现 “Delete”，也可以分别翻译或只改其中一处。
 */

const UI_ATTRIBUTES = new Set(["placeholder", "title", "aria-label", "alt", "value", "label", "error"]);
const UI_HTML_ATTRIBUTES = new Set(["title", "placeholder", "aria-label", "alt"]);
const MESSAGE_PROPERTIES = new Set(["message"]);
const UI_ASSIGNMENT_PROPERTIES = new Set([
  "textContent",
  "innerText",
  "innerHTML",
  "placeholder",
  "title",
  "value",
]);

const UI_WORDS = new Set([
  "all",
  "none",
  "yes",
  "no",
  "ok",
  "cancel",
  "close",
  "open",
  "save",
  "delete",
  "remove",
  "edit",
  "update",
  "create",
  "submit",
  "search",
  "back",
  "next",
  "previous",
]);

function scriptKind(filePath) {
  switch (path.extname(filePath)) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".ts":
      return ts.ScriptKind.TS;
    case ".jsx":
      return ts.ScriptKind.JSX;
    default:
      return ts.ScriptKind.JS;
  }
}

/**
 * 归一化空白，便于比较和生成稳定 key。
 *
 * JSX 文本通常包含缩进和换行，但真正展示给用户的只是折叠后的文本。
 *
 * @param {string} value
 * @returns {string}
 */
export function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * 判断一个字符串是否“像界面文案”。
 *
 * 这是本项目的核心启发式规则。宁可漏提取让人工补补丁，也不要把
 * 代码、URL、CSS 或模板表达式替换掉，否则会直接破坏运行时逻辑。
 *
 * @param {string} value
 * @returns {boolean}
 */
function isUiText(value) {
  if (!value) {
    return false;
  }

  const text = normalizeText(value);
  if (text.length < 2 || text.length > 300) {
    return false;
  }

  if (!/[A-Za-z]/.test(text)) {
    return false;
  }

  if (
    text.includes("${") ||
    text.includes("://") ||
    text.includes("=>") ||
    text.includes("===") ||
    text.includes("!==") ||
    text.includes("&&") ||
    text.includes("||") ||
    text.includes("{{") ||
    text.includes("}}") ||
    text.includes("class=") ||
    text.includes("var(--") ||
    text.includes("@media") ||
    text.includes("!important")
  ) {
    return false;
  }

  if (/^[.#[]/.test(text) || /^(https?:\/\/|\/|\.\.?\/)/.test(text)) {
    return false;
  }

  if (/^(true|false|null|undefined|en|zh|zh-cn)$/i.test(text)) {
    return false;
  }

  if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(text)) {
    return false;
  }

  if (/^[a-z0-9_-]+\/[a-z0-9_.+-]+$/i.test(text)) {
    return false;
  }

  if (/^[a-z0-9_.-]+$/.test(text) && !UI_WORDS.has(text)) {
    return false;
  }

  return true;
}

/**
 * 读取属性名，兼容标识符、字符串字面量和属性访问。
 *
 * @param {import("typescript").Node | undefined} node
 * @returns {string | undefined}
 */
function propertyName(node) {
  if (!node) {
    return undefined;
  }

  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isPrivateIdentifier(node)) {
    return node.text;
  }

  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text;
  }

  return undefined;
}

/**
 * 找到最近的 JSX 父元素标签，用于生成人类可读的上下文。
 *
 * 例如 `<h1>Results</h1>` 的上下文是 `jsx:h1`。
 *
 * @param {import("typescript").Node} node
 * @returns {string}
 */
function jsxParentTag(node) {
  let current = node.parent;
  while (current) {
    if (ts.isJsxElement(current)) {
      return current.openingElement.tagName.getText();
    }
    if (ts.isJsxFragment(current)) {
      return "fragment";
    }
    current = current.parent;
  }
  return "jsx";
}

/**
 * 把源码位置转换为 1 起始的行号，用于报告缺失文案。
 *
 * @param {import("typescript").SourceFile} sourceFile
 * @param {number} position
 * @returns {number}
 */
function lineNumber(sourceFile, position) {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

/**
 * 统一登记一条候选文案。
 *
 * `start`/`end` 是源码中的精确替换区间；`kind` 决定应用翻译时如何保留
 * 引号、反引号和 JSX 空白。
 *
 * @param {object[]} entries 结果数组
 * @param {import("typescript").SourceFile} sourceFile
 * @param {string} file 相对路径
 * @param {string} kind 文案类型
 * @param {string} context 上下文
 * @param {string} text 原始文本
 * @param {number} start 起始偏移
 * @param {number} end 结束偏移
 */
function addEntry(entries, sourceFile, file, kind, context, text, start, end) {
  const source = normalizeText(text);
  if (!isUiText(source)) {
    return;
  }

  entries.push({
    file,
    context,
    source,
    occurrence: 0,
    kind,
    start,
    end,
    line: lineNumber(sourceFile, start),
  });
}

/**
 * 从字符串字面量或 JSX 表达式中的字符串提取文本和替换区间。
 *
 * 只处理普通字符串和无插值模板字符串；带 `${...}` 的模板交给手工补丁，
 * 避免把表达式结构替换坏。
 *
 * @param {import("typescript").Node} node
 * @returns {{text: string, start: number, end: number} | undefined}
 */
function stringLiteralInfo(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { text: node.text, start: node.getStart(), end: node.getEnd() };
  }

  if (ts.isJsxExpression(node) && node.expression) {
    const expression = node.expression;
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
      return {
        text: expression.text,
        start: expression.getStart(),
        end: expression.getEnd(),
      };
    }
  }

  return undefined;
}

/**
 * 提取 alert/confirm/prompt 等调用的第一个字符串参数。
 *
 * @param {object[]} entries
 * @param {import("typescript").SourceFile} sourceFile
 * @param {string} file
 * @param {import("typescript").CallExpression} node
 * @param {string} context
 */
function tryAddStringArgument(entries, sourceFile, file, node, context) {
  const argument = node.arguments?.[0];
  if (!argument) {
    return;
  }

  const info = stringLiteralInfo(argument);
  if (!info) {
    return;
  }

  addEntry(entries, sourceFile, file, "jsString", context, info.text, info.start, info.end);
}

/**
 * 从 innerHTML 模板字符串中提取标签之间的文本和常用属性。
 *
 * 例如 `` `<td>${file.name}</td><button>Remove</button>` `` 只会提取
 * `Remove`，不会提取 `${file.name}`。
 *
 * @param {object[]} entries
 * @param {import("typescript").SourceFile} sourceFile
 * @param {string} file
 * @param {import("typescript").Node} node
 * @param {string} context
 */
function extractHtmlStrings(entries, sourceFile, file, node, context) {
  const contentStart = node.getStart() + 1;
  const contentEnd = node.getEnd() - 1;
  if (contentEnd <= contentStart) {
    return;
  }

  const raw = sourceFile.text.slice(contentStart, contentEnd);
  const textPattern = />([^<>]+)</g;
  for (const match of raw.matchAll(textPattern)) {
    const text = match[1];
    if (!text || !text.trim()) {
      continue;
    }
    const start = contentStart + match.index + 1;
    addEntry(entries, sourceFile, file, "htmlText", `${context}:text`, text, start, start + text.length);
  }

  const attributePattern = /\b(title|placeholder|aria-label|alt)="([^"]*)"/g;
  for (const match of raw.matchAll(attributePattern)) {
    const attribute = match[1];
    const text = match[2];
    if (!text || !text.trim()) {
      continue;
    }
    const start = contentStart + match.index + match[0].indexOf('="') + 2;
    addEntry(
      entries,
      sourceFile,
      file,
      "htmlAttr",
      `${context}:attr:${attribute}`,
      text,
      start,
      start + text.length,
    );
  }
}

/**
 * 递归遍历 AST，收集所有候选文案。
 *
 * @param {object[]} entries
 * @param {import("typescript").SourceFile} sourceFile
 * @param {string} file
 * @param {import("typescript").Node} node
 */
function visit(entries, sourceFile, file, node) {
  if (ts.isJsxText(node)) {
    const start = node.getStart();
    const end = node.getEnd();
    addEntry(
      entries,
      sourceFile,
      file,
      "jsxText",
      `jsx:${jsxParentTag(node)}`,
      sourceFile.text.slice(start, end),
      start,
      end,
    );
  }

  if (ts.isJsxAttribute(node)) {
    const attribute = node.name.getText();
    if (UI_ATTRIBUTES.has(attribute) && node.initializer) {
      const info = stringLiteralInfo(node.initializer);
      if (info) {
        addEntry(
          entries,
          sourceFile,
          file,
          "jsxAttr",
          `attr:${attribute}`,
          info.text,
          info.start,
          info.end,
        );
      }
    }
  }

  if (ts.isPropertyAssignment(node)) {
    const property = propertyName(node.name);
    if (property && MESSAGE_PROPERTIES.has(property) && /(^|\/)src\/(pages|index)/.test(file)) {
      const info = stringLiteralInfo(node.initializer);
      if (info) {
        addEntry(
          entries,
          sourceFile,
          file,
          "prop",
          `prop:${property}`,
          info.text,
          info.start,
          info.end,
        );
      }
    }
  }

  if (file.startsWith("public/") && ts.isBinaryExpression(node)) {
    const operator = node.operatorToken.kind;
    if (operator === ts.SyntaxKind.EqualsToken) {
      const property = propertyName(node.left);
      if (property && UI_ASSIGNMENT_PROPERTIES.has(property)) {
        const info = stringLiteralInfo(node.right);
        if (info) {
          addEntry(
            entries,
            sourceFile,
            file,
            "jsString",
            `js:${property}`,
            info.text,
            info.start,
            info.end,
          );
        }

        if (property === "innerHTML") {
          if (
            ts.isStringLiteral(node.right) ||
            ts.isNoSubstitutionTemplateLiteral(node.right) ||
            ts.isTemplateExpression(node.right)
          ) {
            extractHtmlStrings(entries, sourceFile, file, node.right, "js:innerHTML");
          }
        }
      }
    }
  }

  if (file.startsWith("public/") && ts.isCallExpression(node)) {
    const name = propertyName(node.expression);
    if (name && ["alert", "confirm", "prompt"].includes(name)) {
      tryAddStringArgument(entries, sourceFile, file, node, `call:${name}`);
    }

    if (name === "setAttribute") {
      const attribute = node.arguments?.[0];
      if (attribute && ts.isStringLiteral(attribute) && UI_HTML_ATTRIBUTES.has(attribute.text)) {
        const value = node.arguments?.[1];
        const info = value ? stringLiteralInfo(value) : undefined;
        if (info) {
          addEntry(
            entries,
            sourceFile,
            file,
            "jsAttr",
            `call:setAttribute:${attribute.text}`,
            info.text,
            info.start,
            info.end,
          );
        }
      }
    }
  }

  ts.forEachChild(node, (child) => visit(entries, sourceFile, file, child));
}

/**
 * 为同一文件/上下文/原文的多次出现分配 1 起始的 occurrence。
 *
 * @param {object[]} entries
 * @returns {object[]}
 */
function assignOccurrences(entries) {
  const counters = new Map();
  for (const entry of entries) {
    const key = `${entry.file}\u0000${entry.context}\u0000${entry.source}`;
    const next = (counters.get(key) ?? 0) + 1;
    counters.set(key, next);
    entry.occurrence = next;
  }
  return entries;
}

/**
 * 扫描上游源码并返回所有待翻译文案。
 *
 * @param {string} rootDir 上游源码根目录
 * @returns {object[]} 按文件、位置排序的文案条目
 */
export function extractEntries(rootDir) {
  const entries = [];

  for (const absoluteFile of listSourceFiles(rootDir)) {
    const file = relativeFile(rootDir, absoluteFile);
    const text = fs.readFileSync(absoluteFile, "utf8");
    const sourceFile = ts.createSourceFile(
      absoluteFile,
      text,
      ts.ScriptTarget.Latest,
      true,
      scriptKind(absoluteFile),
    );
    visit(entries, sourceFile, file, sourceFile);
  }

  entries.sort((a, b) => {
    if (a.file !== b.file) {
      return a.file.localeCompare(b.file);
    }
    if (a.start !== b.start) {
      return a.start - b.start;
    }
    return a.context.localeCompare(b.context);
  });

  return assignOccurrences(entries);
}

/**
 * 把提取结果转换为词典条目。
 *
 * 新条目默认 `todo`，必须由人工填写 `target` 后才能通过严格检查。
 *
 * @param {object} entry 提取结果
 * @returns {object}
 */
export function toDictionaryEntry(entry) {
  return {
    file: entry.file,
    context: entry.context,
    source: entry.source,
    occurrence: entry.occurrence,
    target: "",
    status: "todo",
  };
}
