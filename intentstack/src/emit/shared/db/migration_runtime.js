export function migrationRuntimeTs({ banner, driver }) {
  const snippets = driver === 'postgres' ? postgresSnippets() : sqliteSnippets()
  return banner + `import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'

type MigrationClient = ${snippets.clientType}
type MigrationManifest = {
  migrations?: Array<{ id: string; file: string; checksum?: string; rollback_file?: string; rollback_checksum?: string }>
}
type AppliedMigration = { id: string; checksum: string }

function migrationEntries(manifestPath: string) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as MigrationManifest
  return (manifest.migrations || []).map((migration) => ({
    id: migration.id,
    path: migrationPath(manifestPath, migration.file),
    checksum: migration.checksum,
    rollbackPath: migration.rollback_file ? migrationPath(manifestPath, migration.rollback_file) : '',
    rollbackChecksum: migration.rollback_checksum,
  }))
}

function migrationPath(manifestPath: string, file: string) {
  return file.startsWith('migrations/')
    ? join(dirname(dirname(manifestPath)), file)
    : join(dirname(manifestPath), file)
}

function checksum(sql: string) {
  return createHash('sha256').update(sql).digest('hex')
}

export async function runDbMigrations(client: MigrationClient, manifestPath: string) {
  await ensureMigrationTable(client)
  const drift = await checkDbMigrationDrift(client, manifestPath)
  if (drift.unexpected.length || drift.checksum_mismatch.length) {
    throw new Error('IntentStack migration drift detected: ' + JSON.stringify(drift))
  }
  for (const migration of migrationEntries(manifestPath)) {
    const sql = readFileSync(migration.path, 'utf8')
    const hash = checksum(sql)
    if (migration.checksum && migration.checksum !== hash) throw new Error('Migration ' + migration.id + ' does not match manifest checksum.')
    const existing = await migrationRecord(client, migration.id)
    if (existing) {
      if (existing.checksum !== hash) throw new Error('Migration ' + migration.id + ' was already applied with a different checksum.')
      continue
    }
    await executeSqlScript(client, sql)
    await markApplied(client, migration.id, hash)
  }
}

export async function rollbackDbMigration(client: MigrationClient, manifestPath: string) {
  await ensureMigrationTable(client)
  const latest = await lastAppliedMigration(client)
  if (!latest) return { rolled_back: false as const }
  const migration = migrationEntries(manifestPath).find((item) => item.id === latest.id)
  if (!migration?.rollbackPath) throw new Error('No rollback file registered for migration ' + latest.id + '.')
  const sql = readFileSync(migration.rollbackPath, 'utf8')
  const hash = checksum(sql)
  if (migration.rollbackChecksum && migration.rollbackChecksum !== hash) throw new Error('Rollback ' + latest.id + ' does not match manifest checksum.')
  await executeSqlScript(client, sql)
  await unmarkApplied(client, latest.id)
  return { rolled_back: true as const, id: latest.id }
}

export async function checkDbMigrationDrift(client: MigrationClient, manifestPath: string) {
  await ensureMigrationTable(client)
  const entries = migrationEntries(manifestPath)
  const expected = new Map(entries.map((entry) => [entry.id, entry]))
  const applied = await appliedMigrationRecords(client)
  const appliedMap = new Map(applied.map((record) => [record.id, record]))
  const checksum_mismatch = entries
    .filter((entry) => entry.checksum && appliedMap.has(entry.id) && appliedMap.get(entry.id)?.checksum !== entry.checksum)
    .map((entry) => ({ id: entry.id, expected: entry.checksum || '', actual: appliedMap.get(entry.id)?.checksum || '' }))
  const unexpected = applied.filter((record) => !expected.has(record.id)).map((record) => record.id)
  return {
    ok: unexpected.length === 0 && checksum_mismatch.length === 0,
    expected: entries.map((entry) => entry.id),
    applied: applied.map((record) => record.id),
    missing: entries.filter((entry) => !appliedMap.has(entry.id)).map((entry) => entry.id),
    unexpected,
    checksum_mismatch,
  }
}

async function ensureMigrationTable(client: MigrationClient) {
  const sql = ['CREATE TABLE IF NOT EXISTS __intentstack_migrations (', '  id text PRIMARY KEY NOT NULL,', '  checksum text NOT NULL,', ${snippets.appliedAtColumn}, ')'].join('\\n')
  ${snippets.ensure}
}

${snippets.runtime}
`
}

function sqliteSnippets() {
  return {
    clientType: 'any',
    appliedAtColumn: "'  applied_at text NOT NULL'",
    ensure: 'await client.execute(sql)',
    runtime: `async function migrationRecord(client: MigrationClient, id: string) {
  const result = await client.execute({ sql: 'SELECT checksum FROM __intentstack_migrations WHERE id = ?', args: [id] })
  return result.rows[0] as { checksum?: string } | undefined
}

async function appliedMigrationRecords(client: MigrationClient): Promise<AppliedMigration[]> {
  const result = await client.execute('SELECT id, checksum FROM __intentstack_migrations ORDER BY applied_at')
  return result.rows as AppliedMigration[]
}

async function lastAppliedMigration(client: MigrationClient): Promise<AppliedMigration | undefined> {
  const result = await client.execute('SELECT id, checksum FROM __intentstack_migrations ORDER BY applied_at DESC LIMIT 1')
  return result.rows[0] as AppliedMigration | undefined
}

async function markApplied(client: MigrationClient, id: string, hash: string) {
  await client.execute({ sql: 'INSERT INTO __intentstack_migrations (id, checksum, applied_at) VALUES (?, ?, ?)', args: [id, hash, new Date().toISOString()] })
}

async function unmarkApplied(client: MigrationClient, id: string) {
  await client.execute({ sql: 'DELETE FROM __intentstack_migrations WHERE id = ?', args: [id] })
}

async function executeSqlScript(client: MigrationClient, sqlText: string) {
  await client.executeMultiple(sqlText)
}`,
  }
}

function postgresSnippets() {
  return {
    clientType: 'any',
    appliedAtColumn: "'  applied_at timestamptz NOT NULL'",
    ensure: 'await client.unsafe(sql)',
    runtime: `async function migrationRecord(client: MigrationClient, id: string) {
  const rows = await client.unsafe('SELECT checksum FROM __intentstack_migrations WHERE id = $1', [id])
  return rows[0] as { checksum?: string } | undefined
}

async function appliedMigrationRecords(client: MigrationClient): Promise<AppliedMigration[]> {
  return await client.unsafe('SELECT id, checksum FROM __intentstack_migrations ORDER BY applied_at') as AppliedMigration[]
}

async function lastAppliedMigration(client: MigrationClient): Promise<AppliedMigration | undefined> {
  const rows = await client.unsafe('SELECT id, checksum FROM __intentstack_migrations ORDER BY applied_at DESC LIMIT 1')
  return rows[0] as AppliedMigration | undefined
}

async function markApplied(client: MigrationClient, id: string, hash: string) {
  await client.unsafe('INSERT INTO __intentstack_migrations (id, checksum, applied_at) VALUES ($1, $2, now())', [id, hash])
}

async function unmarkApplied(client: MigrationClient, id: string) {
  await client.unsafe('DELETE FROM __intentstack_migrations WHERE id = $1', [id])
}

async function executeSqlScript(client: MigrationClient, sqlText: string) {
  for (const statement of sqlText.split(';').map((part) => part.trim()).filter(Boolean)) await client.unsafe(statement)
}`,
  }
}
