import fs from "node:fs";
import path from "node:path";

const SOURCE_EXTENSIONS = new Set([".tsx", ".ts", ".jsx", ".js"]);

function walk(dir, result) {
  if (!fs.existsSync(dir)) {
    return;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name === ".git" ||
      entry.name === "coverage"
    ) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, result);
      continue;
    }

    const ext = path.extname(entry.name);
    if (SOURCE_EXTENSIONS.has(ext) && !entry.name.endsWith(".d.ts")) {
      result.push(fullPath);
    }
  }
}

export function listSourceFiles(rootDir) {
  const result = [];
  walk(path.join(rootDir, "src"), result);
  walk(path.join(rootDir, "public"), result);
  return result.sort();
}

export function relativeFile(rootDir, filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join("/");
}

export function readJson(filePath, fallback = undefined) {
  if (!fs.existsSync(filePath)) {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error(`File not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
