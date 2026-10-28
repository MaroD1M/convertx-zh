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

export function requireArg(value, name) {
  if (!value || value === true) {
    console.error(`缺少参数: ${name}`);
    process.exit(1);
  }
  return value;
}
