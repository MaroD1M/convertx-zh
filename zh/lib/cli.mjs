/**
 * 极简 CLI 参数解析。
 *
 * 支持三种形式：
 * - `--key=value`
 * - `--key value`
 * - `--flag`（值为 true）
 *
 * 项目脚本很小，使用 Node 内置能力即可，不引入额外依赖。
 *
 * @param {string[]} argv `process.argv.slice(2)`
 * @returns {Record<string, string | true> & {_: string[]}}
 */
export function parseArgs(argv) {
  const args = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      args._.push(value);
      continue;
    }

    const withoutPrefix = value.slice(2);
    const equals = withoutPrefix.indexOf("=");
    if (equals >= 0) {
      args[withoutPrefix.slice(0, equals)] = withoutPrefix.slice(equals + 1);
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[withoutPrefix] = next;
      index += 1;
      continue;
    }

    args[withoutPrefix] = true;
  }

  return args;
}

/**
 * 校验必填位置参数。
 *
 * @param {string | true | undefined} value 待校验值
 * @param {string} name 参数说明，用于错误提示
 * @returns {string}
 */
export function requireArg(value, name) {
  if (!value || value === true) {
    console.error(`缺少参数: ${name}`);
    process.exit(1);
  }
  return value;
}
