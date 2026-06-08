const IMPORTABLE = /\.(m?[jt]sx?)$/

export function optimizeGeneratedFiles(files) {
  return Object.fromEntries(
    Object.entries(files)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([rel, content]) => [rel, optimizeGeneratedFile(rel, content)]),
  )
}

export function optimizeGeneratedFile(rel, content) {
  if (!IMPORTABLE.test(rel)) return content
  return dedupeImportLines(String(content))
}

export function dedupeImportLines(content) {
  const seen = new Set()
  return content
    .split('\n')
    .filter((line) => {
      if (!line.startsWith('import ')) return true
      if (seen.has(line)) return false
      seen.add(line)
      return true
    })
    .join('\n')
}
