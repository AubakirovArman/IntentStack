#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

const args = process.argv.slice(2)
const maxLines = Number(flagValue('--max-lines', '300'))
const enforce = args.includes('--enforce')
const extensions = new Set(flagValue('--extensions', '.js,.ts,.tsx,.rs').split(',').map((x) => x.trim()).filter(Boolean))
const scopes = flagValue('--scope', 'src,test,crates/intent_core/src')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean)

const ignoreDirs = new Set(['node_modules', 'dist', 'build', '.next', '.git', 'target', 'generated', '.intentstack'])
const violations = []

for (const scope of scopes) {
  const absScope = join(root, scope)
  walk(absScope)
}

if (violations.length === 0) {
  console.log(`ok file-size audit passed for ${scopes.join(', ')}`)
  process.exit(0)
}

violations.sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path))
for (const item of violations) {
  console.log(`${item.path}: ${item.lines} lines (limit ${maxLines})`)
}

if (enforce) {
  console.error(`x file-size audit failed: ${violations.length} file(s) over limit`)
  process.exit(1)
}

console.log(`i file-size audit: ${violations.length} file(s) over limit ${maxLines}`)
process.exit(0)

function walk(base) {
  if (!exists(base)) return
  const stat = statSync(base)
  if (!stat.isDirectory()) return
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (ignoreDirs.has(entry.name)) continue
      walk(join(base, entry.name))
      continue
    }
    if (!entry.isFile()) continue
    if (!extensions.has(extname(entry.name))) continue
    const filePath = join(base, entry.name)
    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/).length
    if (lines > maxLines) violations.push({ path: relative(root, filePath), lines })
  }
}

function exists(path) {
  try {
    statSync(path)
    return true
  } catch {
    return false
  }
}

function flagValue(name, defaultValue) {
  const idx = args.indexOf(name)
  if (idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith('--')) return args[idx + 1]
  return defaultValue
}
