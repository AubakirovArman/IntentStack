// Emit orchestrator: dispatch on the chosen target, write files, clean only managed zones
// so hand-written custom/ code survives (PRD 32).
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ADAPTERS } from '../targets/index.js'
import { dbDriver } from './shared/db_driver.js'
import { optimizeGeneratedFiles } from './optimize.js'

export function getAdapter(graph) {
  const id = graph.project?.target
  const adapter = ADAPTERS[id]
  if (!adapter) throw new Error(`No adapter registered for target "${id}". Available: ${Object.keys(ADAPTERS).join(', ')}`)
  return adapter
}

export function planFiles(graph, opts = {}) {
  const planned = opts.cacheDir ? planFilesCached(graph, opts.cacheDir) : getAdapter(graph).planFiles(graph)
  return filterPlannedFiles(optimizeGeneratedFiles(planned), opts.only)
}

export function emit(graph, outDir, options = {}) {
  const clean = options.clean !== false
  const adapter = getAdapter(graph)
  const planned = planFiles(graph, { only: options.only, cacheDir: options.cache ? outDir : null })
  const files = optimizeGeneratedFiles(clean ? evolveMigrationFiles(graph, outDir, planned) : planned)
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

export function intentDigest(graph) {
  return checksum(JSON.stringify({
    version: graph.version,
    project: graph.project,
    theme: graph.theme,
    auth: graph.auth,
    tenancy: graph.tenancy,
    navigation: graph.navigation,
    entities: graph.entities,
    actions: graph.actions,
    pages: graph.pages,
    workflows: graph.workflows,
    integrations: graph.integrations,
  }))
}

function planFilesCached(graph, outDir) {
  const adapter = getAdapter(graph)
  const digest = intentDigest(graph)
  const cacheFile = join(outDir, '.intentstack', 'emit-cache', `${graph.project?.target || 'target'}-${digest}.json`)
  if (existsSync(cacheFile)) {
    try { return JSON.parse(readFileSync(cacheFile, 'utf8')).files || {} } catch { /* regenerate */ }
  }
  const files = adapter.planFiles(graph)
  mkdirSync(dirname(cacheFile), { recursive: true })
  writeFileSync(cacheFile, JSON.stringify({ digest, target: graph.project?.target, files }, null, 2) + '\n')
  return files
}

function filterPlannedFiles(files, only) {
  const patterns = Array.isArray(only)
    ? only
    : String(only || '').split(',').map((item) => item.trim()).filter(Boolean)
  if (patterns.length === 0) return files
  return Object.fromEntries(Object.entries(files).filter(([rel]) => patterns.some((pattern) => fileMatches(rel, pattern))))
}

function fileMatches(rel, pattern) {
  const p = pattern.replace(/\\/g, '/')
  if (p.includes('*')) return globRegex(p).test(rel)
  return rel.includes(p)
}

function globRegex(pattern) {
  return new RegExp('^' + pattern.split('*').map(escapeRegex).join('.*') + '$')
}

function escapeRegex(value) {
  return value.replace(/[\\^$+?.()|[\]{}]/g, '\\$&')
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
  const rollbackFile = `${id}.down.sql`
  const sql = driver.diffMigrationSql(previous.schema, current.schema)
  const rollbackSql = driver.rollbackMigrationSql?.(previous.schema, current.schema) || '-- No rollback available.\n'
  const nextManifest = {
    ...current,
    previous_schema_checksum: previous.schema_checksum,
    migrations: [
      ...(previous.migrations || []),
      {
        id,
        file,
        checksum: checksum(sql),
        rollback_file: rollbackFile,
        rollback_checksum: checksum(rollbackSql),
        previous_schema_checksum: previous.schema_checksum,
        schema_checksum: current.schema_checksum,
      },
    ],
  }
  return {
    ...files,
    ...preserved,
    [`migrations/${file}`]: sql,
    [`migrations/${rollbackFile}`]: rollbackSql,
    [driver.manifestFile]: JSON.stringify(nextManifest, null, 2) + '\n',
  }
}

function readExistingMigrationFiles(outDir, manifest) {
  const out = {}
  for (const migration of manifest.migrations || []) {
    if (!migration.file) continue
    const rel = migration.file.startsWith('migrations/')
      ? migration.file
      : `migrations/${migration.file}`
    const abs = join(outDir, rel)
    if (existsSync(abs)) out[rel] = readFileSync(abs, 'utf8')
    if (migration.rollback_file) {
      const downRel = migration.rollback_file.startsWith('migrations/')
        ? migration.rollback_file
        : `migrations/${migration.rollback_file}`
      const downAbs = join(outDir, downRel)
      if (existsSync(downAbs)) out[downRel] = readFileSync(downAbs, 'utf8')
    }
  }
  return out
}

function checksum(sql) {
  return createHash('sha256').update(sql).digest('hex')
}
