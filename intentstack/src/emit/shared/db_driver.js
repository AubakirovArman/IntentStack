// Database driver abstraction. v0.1 ships SQLite/libSQL, but targets consume it
// through this driver contract instead of embedding migration/client code inline.

export const DB_DRIVERS = {
  sqlite: {
    id: 'sqlite',
    migrationFile: 'migrations/0000_init.sql',
    clientTs: sqliteClientTs,
  },
}

export function dbDriver(graph) {
  const id = graph.database?.driver || graph.project?.database?.driver || 'sqlite'
  const driver = DB_DRIVERS[id]
  if (!driver) throw new Error(`Unsupported database driver "${id}". Available: ${Object.keys(DB_DRIVERS).join(', ')}`)
  return driver
}

function sqliteClientTs({ banner, pathImports, pathPrelude = '', migrationPathExpr, functionName, memoized }) {
  const runner = memoized
    ? `let migrated: Promise<void> | null = null
export function ${functionName}() {
  if (!migrated) migrated = runMigrations()
  return migrated
}
`
    : `export async function ${functionName}() {
  await runMigrations()
}
`
  return banner + `import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
${pathImports}

const url = process.env.DB_URL ?? 'file:./data.db'
export const client = createClient({ url })
export const db = drizzle(client)
${pathPrelude}
const MIGRATIONS = [
  { id: '0000_init', path: ${migrationPathExpr} },
] as const

async function ensureMigrationTable() {
  await client.execute(\`
    CREATE TABLE IF NOT EXISTS __intentstack_migrations (
      id text PRIMARY KEY NOT NULL,
      checksum text NOT NULL,
      applied_at text NOT NULL
    )
  \`)
}

function checksum(sql: string) {
  return createHash('sha256').update(sql).digest('hex')
}

async function migrationRecord(id: string) {
  const result = await client.execute({ sql: 'SELECT checksum FROM __intentstack_migrations WHERE id = ?', args: [id] })
  return result.rows[0] as { checksum?: string } | undefined
}

async function markApplied(id: string, hash: string) {
  await client.execute({
    sql: 'INSERT INTO __intentstack_migrations (id, checksum, applied_at) VALUES (?, ?, ?)',
    args: [id, hash, new Date().toISOString()],
  })
}

async function runMigrations() {
  await ensureMigrationTable()
  for (const migration of MIGRATIONS) {
    const sql = readFileSync(migration.path, 'utf8')
    const hash = checksum(sql)
    const existing = await migrationRecord(migration.id)
    if (existing) {
      if (existing.checksum !== hash) throw new Error(\`Migration \${migration.id} was already applied with a different checksum.\`)
      continue
    }
    await client.executeMultiple(sql)
    await markApplied(migration.id, hash)
  }
}

${runner}`
}
