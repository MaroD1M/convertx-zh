import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

import { listSourceFiles, relativeFile } from "./files.mjs";

const UI_ATTRIBUTES = new Set(["placeholder", "title", "aria-label", "alt", "value", "label"]);
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

export function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

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

function lineColumn(sourceFile, position) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(position);
  return { line: line + 1, column: character + 1 };
}

function addEntry(entries, sourceFile, file, kind, context, text, start, end, locationOffset = 0) {
  const source = normalizeText(text);
  if (!isUiText(source)) {
    return;
  }

  const location = lineColumn(sourceFile, start + locationOffset);
  entries.push({
    file,
    context,
    source,
    occurrence: 0,
    kind,
    start,
    end,
    line: location.line,
    column: location.column,
  });
}

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
