export function keyOf(entry) {
  return `${entry.file}\u0000${entry.context}\u0000${entry.source}\u0000${entry.occurrence}`;
}

export function displayKey(entry) {
  return `${entry.file} [${entry.context}#${entry.occurrence}] ${entry.source}`;
}
