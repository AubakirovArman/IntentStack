// Emit orchestrator: dispatch on the chosen target, write files, clean only managed zones
// so hand-written custom/ code survives (PRD 32).
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ADAPTERS } from '../targets/index.js'
import { dbDriver } from './shared/db_driver.js'

export function getAdapter(graph) {
  const id = graph.project?.target
  const adapter = ADAPTERS[id]
  if (!adapter) throw new Error(`No adapter registered for target "${id}". Available: ${Object.keys(ADAPTERS).join(', ')}`)
  return adapter
}

export function planFiles(graph) {
  return getAdapter(graph).planFiles(graph)
}

export function emit(graph, outDir, { clean = true } = {}) {
  const adapter = getAdapter(graph)
  const files = clean ? evolveMigrationFiles(graph, outDir, adapter.planFiles(graph)) : adapter.planFiles(graph)
  if (clean) {
    for (const zone of adapter.managedZones || []) {
      const p = join(outDir, zone)
      try { if (existsSync(p)) rmSync(p, { recursive: true, force: true }) } catch { /* best-effort: overwrite below */ }
    }
  }
  const written = []
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(outDir, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
    written.push(rel)
  }
  return written.sort()
}

function evolveMigrationFiles(graph, outDir, files) {
  const driver = dbDriver(graph)
  if (!files[driver.manifestFile]) return files
  const manifestPath = join(outDir, driver.manifestFile)
  if (!existsSync(manifestPath)) return files

  let previous
  let current
  try {
    previous = JSON.parse(readFileSync(manifestPath, 'utf8'))
    current = JSON.parse(files[driver.manifestFile])
  } catch {
    return files
  }
  if (previous.driver && previous.driver !== driver.id) return files
  if (!previous.schema || !previous.schema_checksum || !current.schema || !current.schema_checksum) return files

  const preserved = readExistingMigrationFiles(outDir, previous)
  if (previous.schema_checksum === current.schema_checksum) {
    return {
      ...files,
      ...preserved,
      [driver.manifestFile]: JSON.stringify(previous, null, 2) + '\n',
    }
  }

  const nextIndex = Array.isArray(previous.migrations) ? previous.migrations.length : 0
  const id = `${String(nextIndex).padStart(4, '0')}_update`
  const file = `${id}.sql`
  const sql = driver.diffMigrationSql(previous.schema, current.schema)
  const nextManifest = {
    ...current,
    previous_schema_checksum: previous.schema_checksum,
    migrations: [
      ...(previous.migrations || []),
      {
        id,
        file,
        checksum: checksum(sql),
        previous_schema_checksum: previous.schema_checksum,
        schema_checksum: current.schema_checksum,
      },
    ],
  }
  return {
    ...files,
    ...preserved,
    [`migrations/${file}`]: sql,
    [driver.manifestFile]: JSON.stringify(nextManifest, null, 2) + '\n',
  }
}

function readExistingMigrationFiles(outDir, manifest) {
  const out = {}
  for (const migration of manifest.migrations || []) {
    if (!migration.file) continue
    const rel = `migrations/${migration.file}`
    const abs = join(outDir, rel)
    if (existsSync(abs)) out[rel] = readFileSync(abs, 'utf8')
  }
  return out
}

function checksum(sql) {
  return createHash('sha256').update(sql).digest('hex')
}
