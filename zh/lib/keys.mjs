/**
 * 词典主键。
 *
 * 使用“文件 + 上下文 + 原文 + 出现序号”而不是行号：
 * 上游调整空行或插入无关代码时，已有翻译不会整份失效。
 *
 * @param {{file: string, context: string, source: string, occurrence: number}} entry
 * @returns {string}
 */
export function keyOf(entry) {
  return `${entry.file}\u0000${entry.context}\u0000${entry.source}\u0000${entry.occurrence}`;
}
