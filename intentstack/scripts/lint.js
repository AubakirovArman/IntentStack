#!/usr/bin/env node
import { readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const skipDirs = new Set(['node_modules', 'target', 'dist', '.next', 'docs-site'])
const files = []

walk(root)

for (const file of files) {
  const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', stdio: 'pipe' })
  if ((res.status ?? 1) !== 0) {
    console.error(`Syntax check failed: ${relative(root, file)}`)
    if (res.stderr) console.error(res.stderr.trim())
    process.exit(res.status ?? 1)
  }
}

console.log(`ok syntax checked ${files.length} JavaScript file(s)`)

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) walk(join(dir, entry.name))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.js')) files.push(join(dir, entry.name))
  }
}
