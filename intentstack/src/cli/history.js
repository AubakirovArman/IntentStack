import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { formatGeneratedFiles } from '../pipeline.js'

export function patchHistoryPath(intentPath) {
  return join(dirname(intentPath), '.intentstack', 'patch-history.ndjson')
}

export function appendPatchHistory(intentPath, patchArg, changes) {
  const p = patchHistoryPath(intentPath)
  mkdirSync(dirname(p), { recursive: true })
  appendFileSync(p, JSON.stringify({
    timestamp: new Date().toISOString(),
    patch: patchArg,
    changes,
  }) + '\n')
}

export function readPatchHistory(intentPath) {
  const p = patchHistoryPath(intentPath)
  if (!existsSync(p)) return []
  return readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line) }
      catch { return null }
    })
    .filter(Boolean)
}

export function formatPlannedForDiff(files, outDir) {
  const rels = Object.keys(files)
  const tempDir = mkdtempSync(join(tmpdir(), 'intentstack-diff-'))
  try {
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(tempDir, rel)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, content)
    }
    const rows = formatGeneratedFiles(tempDir, rels, { toolRoot: outDir })
    if (rows.some((row) => row.status === 'failed')) return files
    return Object.fromEntries(rels.map((rel) => [rel, readFileSync(join(tempDir, rel), 'utf8')]))
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

export function report(written, outDir, d, ast, phases = {}) {
  const count = (pre) => written.filter((f) => f.startsWith(pre)).length
  console.log(`\nok Generated ${written.length} files into ${outDir}`)
  console.log(`   target: ${ast?.project?.target}`)
  console.log(`   frontend: ${count('src/') + count('app/') + count('components/')}   api: ${count('server/') + count('app/api/')}   lib: ${count('lib/')}   migrations: ${count('migrations/')}`)
  if (d.warnings.length) console.log(`   warnings: ${d.warnings.length} (non-blocking)`)
  if (phases.format) {
    for (const row of phases.format) {
      const suffix = row.status === 'ok' ? row.detail : row.reason
      console.log(`   format ${row.tool}: ${row.status}${suffix ? ` (${suffix})` : ''}`)
    }
  }
  if (phases.verify) {
    const suffix = phases.verify.command || phases.verify.reason || phases.verify.error
    console.log(`   verify: ${phases.verify.status}${suffix ? ` (${suffix})` : ''}`)
  }
  console.log('\nNext:  cd <app-dir> && npm install && npm run dev')
}
