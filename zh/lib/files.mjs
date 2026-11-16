import fs from "node:fs";
import path from "node:path";

/**
 * 源文件扫描与 JSON 读写工具。
 *
 * 汉化覆盖层只关心上游的 `src/` 和 `public/`，因此这里刻意不扫描
 * `node_modules`、`dist`、`.git` 和覆盖率目录，避免把依赖或构建产物
 * 当成待翻译文案。
 */

const SOURCE_EXTENSIONS = new Set([".tsx", ".ts", ".jsx", ".js"]);

/**
 * 递归收集目录下的源文件绝对路径。
 *
 * @param {string} dir 起始目录
 * @param {string[]} result 结果数组，递归过程中原地追加
 */
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

/**
 * 返回需要提取文案的上游文件绝对路径。
 *
 * @param {string} rootDir 上游源码根目录
 * @returns {string[]} 排序后的文件列表
 */
export function listSourceFiles(rootDir) {
  const result = [];
  walk(path.join(rootDir, "src"), result);
  walk(path.join(rootDir, "public"), result);
  return result.sort();
}

/**
 * 将绝对路径转换为词典中使用的 POSIX 相对路径。
 *
 * 词典必须跨平台稳定，因此这里强制把 Windows 的 `\` 转成 `/`。
 *
 * @param {string} rootDir 上游源码根目录
 * @param {string} filePath 文件绝对路径
 * @returns {string} 例如 `src/pages/root.tsx`
 */
export function relativeFile(rootDir, filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join("/");
}

/**
 * 读取 JSON 文件。
 *
 * @param {string} filePath 文件路径
 * @param {unknown} [fallback] 文件不存在时的返回值；不传则抛错
 * @returns {any}
 */
export function readJson(filePath, fallback = undefined) {
  if (!fs.existsSync(filePath)) {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error(`File not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/**
 * 以固定格式写入 JSON。
 *
 * 固定缩进和结尾换行可以让 `sync.mjs` 产生的 diff 更稳定，方便审查。
 *
 * @param {string} filePath 文件路径
 * @param {unknown} value 要写入的数据
 */
export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
