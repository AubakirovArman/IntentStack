// Database driver abstraction. Targets consume schema, migration, client and
// package metadata through this contract instead of embedding SQLite details.

import { createHash } from 'node:crypto'
import { snake } from '../util.js'

const q = (s) => `'${s}'`
const col = (id) => snake(id)

const SQLITE_DRIZZLE = {
  string: (f) => `text(${q(col(f.id))})`,
  text: (f) => `text(${q(col(f.id))})`,
  enum: (f) => `text(${q(col(f.id))})`,
  number: (f) => `real(${q(col(f.id))})`,
  boolean: (f) => `integer(${q(col(f.id))}, { mode: 'boolean' })`,
  datetime: (f) => `integer(${q(col(f.id))}, { mode: 'timestamp' })`,
}
const SQLITE_SQLTYPE = { string: 'text', text: 'text', enum: 'text', number: 'real', boolean: 'integer', datetime: 'integer' }
const POSTGRES_DRIZZLE = {
  string: (f) => `text(${q(col(f.id))})`,
  text: (f) => `text(${q(col(f.id))})`,
  enum: (f) => `text(${q(col(f.id))})`,
  number: (f) => `doublePrecision(${q(col(f.id))})`,
  boolean: (f) => `boolean(${q(col(f.id))})`,
  datetime: (f) => `timestamp(${q(col(f.id))}, { withTimezone: true })`,
}
const POSTGRES_SQLTYPE = { string: 'text', text: 'text', enum: 'text', number: 'double precision', boolean: 'boolean', datetime: 'timestamptz' }

export const DB_DRIVERS = {
  sqlite: {
    id: 'sqlite',
    label: 'SQLite/libSQL',
    migrationFile: 'migrations/0000_init.sql',
    manifestFile: 'migrations/manifest.json',
    packageDependencies: {
      '@libsql/client': '^0.14.0',
      'drizzle-orm': '^0.36.4',
    },
    schemaSnapshot,
    schemaChecksum,
    schemaImports: sqliteSchemaImports,
    schemaBody: sqliteSchemaBody,
    migrationSql: sqliteMigrationSql,
    diffMigrationSql: sqliteDiffMigrationSql,
    migrationManifest,
    clientTs: sqliteClientTs,
    envExampleLines: () => [
      'DB_URL=file:./data.db',
      '# INTENTSTACK_AUTO_MIGRATE=false   # production: run npm run migrate during deploy',
    ],
    readmeDatabase: () => `The generated app reads \`migrations/manifest.json\` and applies listed SQL migrations to a
local SQLite file (\`data.db\`) on boot. For production deploys, set
\`INTENTSTACK_AUTO_MIGRATE=false\` and run \`npm run migrate\` as a separate deploy step.`,
    gitignore: ['*.db', 'data.db'],
  },
  postgres: {
    id: 'postgres',
    label: 'PostgreSQL',
    migrationFile: 'migrations/0000_init.sql',
    manifestFile: 'migrations/manifest.json',
    packageDependencies: {
      postgres: '^3.4.5',
      'drizzle-orm': '^0.36.4',
    },
    schemaSnapshot,
    schemaChecksum,
    schemaImports: postgresSchemaImports,
    schemaBody: postgresSchemaBody,
    migrationSql: postgresMigrationSql,
    diffMigrationSql: postgresDiffMigrationSql,
    migrationManifest,
    clientTs: postgresClientTs,
    envExampleLines: () => [
      'DATABASE_URL=postgres://postgres:postgres@localhost:5432/intentstack',
      '# INTENTSTACK_AUTO_MIGRATE=false   # production: run npm run migrate during deploy',
    ],
    readmeDatabase: () => `The generated app reads \`migrations/manifest.json\` and applies listed SQL migrations
to PostgreSQL using \`DATABASE_URL\`. For production deploys, set
\`INTENTSTACK_AUTO_MIGRATE=false\` and run \`npm run migrate\` as a separate deploy step.`,
    gitignore: [],
  },
}

export const DATABASE_DRIVER_IDS = Object.keys(DB_DRIVERS)

export function dbDriver(graph) {
  const id = graph.database?.driver || graph.project?.database?.driver || 'sqlite'
  const driver = DB_DRIVERS[id]
  if (!driver) throw new Error(`Unsupported database driver "${id}". Available: ${Object.keys(DB_DRIVERS).join(', ')}`)
  return driver
}

function sqliteSchemaImports() {
  return `import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core'\n`
}

function postgresSchemaImports() {
  return `import { pgTable, serial, text, doublePrecision, boolean, timestamp } from 'drizzle-orm/pg-core'\n`
}

function sqliteSchemaBody(graph) {
  let out = ''
  for (const e of graph.entities) {
    out += `\nexport const ${e.id.toLowerCase()} = sqliteTable(${q(e.table || e.id.toLowerCase())}, {\n`
    out += `  id: integer('id').primaryKey({ autoIncrement: true }),\n`
    if (graph.tenancy?.enabled === true) out += `  tenantId: text('tenant_id').notNull(),\n`
    for (const f of e.fields || []) {
      let line = `  ${f.id}: ` + (SQLITE_DRIZZLE[f.type] || SQLITE_DRIZZLE.string)(f)
      if (f.required) line += `.notNull()`
      if (f.default !== undefined) line += `.default(${typeof f.default === 'string' ? q(f.default) : f.default})`
      out += line + `,\n`
    }
    out += `  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),\n`
    out += `})\n`
  }
  return out
}

function postgresSchemaBody(graph) {
  let out = ''
  for (const e of graph.entities) {
    out += `\nexport const ${e.id.toLowerCase()} = pgTable(${q(e.table || e.id.toLowerCase())}, {\n`
    out += `  id: serial('id').primaryKey(),\n`
    if (graph.tenancy?.enabled === true) out += `  tenantId: text('tenant_id').notNull(),\n`
    for (const f of e.fields || []) {
      let line = `  ${f.id}: ` + (POSTGRES_DRIZZLE[f.type] || POSTGRES_DRIZZLE.string)(f)
      if (f.required) line += `.notNull()`
      if (f.default !== undefined) line += `.default(${typeof f.default === 'string' ? q(f.default) : f.default})`
      out += line + `,\n`
    }
    out += `  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),\n`
    out += `})\n`
  }
  return out
}

function sqliteMigrationSql(graph) {
  let out = '-- @generated by IntentStack. Applied automatically on server start.\n\n'
  for (const e of graph.entities) {
    out += `CREATE TABLE IF NOT EXISTS ${e.table || e.id.toLowerCase()} (\n`
    const lines = ['  id integer PRIMARY KEY AUTOINCREMENT NOT NULL']
    if (graph.tenancy?.enabled === true) lines.push('  tenant_id text NOT NULL')
    for (const f of e.fields || []) {
      let l = `  ${col(f.id)} ${SQLITE_SQLTYPE[f.type] || 'text'}`
      if (f.default !== undefined) l += ` DEFAULT ${typeof f.default === 'string' ? `'${f.default}'` : f.default}`
      if (f.required) l += ' NOT NULL'
      lines.push(l)
    }
    lines.push('  created_at integer NOT NULL')
    out += lines.join(',\n') + '\n);\n\n'
  }
  return out
}

function postgresMigrationSql(graph) {
  let out = '-- @generated by IntentStack. Applied automatically on server start.\n\n'
  for (const e of graph.entities) {
    out += `CREATE TABLE IF NOT EXISTS ${e.table || e.id.toLowerCase()} (\n`
    const lines = ['  id serial PRIMARY KEY']
    if (graph.tenancy?.enabled === true) lines.push('  tenant_id text NOT NULL')
    for (const f of e.fields || []) {
      let l = `  ${col(f.id)} ${POSTGRES_SQLTYPE[f.type] || 'text'}`
      if (f.default !== undefined) l += ` DEFAULT ${postgresDefault(f.default)}`
      if (f.required) l += ' NOT NULL'
      lines.push(l)
    }
    lines.push('  created_at timestamptz NOT NULL')
    out += lines.join(',\n') + '\n);\n\n'
  }
  return out
}

function migrationManifest(graph) {
  const driver = dbDriver(graph)
  const schema = driver.schemaSnapshot(graph)
  const initSql = driver.migrationSql(graph)
  return JSON.stringify({
    version: 1,
    driver: driver.id,
    schema_checksum: driver.schemaChecksum(schema),
    schema,
    migrations: [
      {
        id: '0000_init',
        file: '0000_init.sql',
        checksum: checksum(initSql),
      },
    ],
  }, null, 2) + '\n'
}

function schemaSnapshot(graph) {
  return {
    tenancy: graph.tenancy?.enabled === true ? { enabled: true } : { enabled: false },
    entities: (graph.entities || []).map((entity) => ({
      id: entity.id,
      table: entity.table || entity.id.toLowerCase(),
      fields: [
        { id: 'id', column: 'id', type: 'integer', generated: true, primary_key: true, required: true },
        ...(graph.tenancy?.enabled === true ? [{ id: 'tenantId', column: 'tenant_id', type: 'string', generated: true, required: true }] : []),
        ...(entity.fields || []).map((field) => ({
          id: field.id,
          column: col(field.id),
          type: field.type || 'string',
          required: field.required === true,
          default: field.default,
          values: field.values || null,
        })),
        { id: 'createdAt', column: 'created_at', type: 'datetime', generated: true, required: true },
      ],
    })),
  }
}

function schemaChecksum(schema) {
  return checksum(JSON.stringify(canonical(schema)))
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
}

function sqliteDiffMigrationSql(previous, current) {
  const statements = []
  const previousEntities = new Map((previous?.entities || []).map((entity) => [entity.id, entity]))
  for (const entity of current.entities || []) {
    const before = previousEntities.get(entity.id)
    if (!before) {
      statements.push(sqliteCreateTableFromSnapshot(entity))
      continue
    }
    const previousFields = new Map((before.fields || []).map((field) => [field.id, field]))
    for (const field of entity.fields || []) {
      if (previousFields.has(field.id)) continue
      statements.push(sqliteAddColumn(entity, field))
    }
    for (const field of before.fields || []) {
      const next = (entity.fields || []).find((item) => item.id === field.id)
      if (!next) statements.push(`-- Column ${field.column} was removed from intent for table ${entity.table}. SQLite keeps existing columns; create a manual data migration before dropping it.`)
      else if (field.type !== next.type) statements.push(`-- Column ${field.column} changed type from ${field.type} to ${next.type}. SQLite requires a manual table rebuild for type changes.`)
    }
  }
  for (const entity of previous?.entities || []) {
    if (!(current.entities || []).some((item) => item.id === entity.id)) {
      statements.push(`-- Table ${entity.table} was removed from intent. IntentStack does not drop tables automatically.`)
    }
  }
  if (statements.length === 0) statements.push('-- No database changes detected.')
  return `-- @generated by IntentStack. Schema evolution migration.\n\n${statements.join('\n\n')}\n`
}

function postgresDiffMigrationSql(previous, current) {
  const statements = []
  const previousEntities = new Map((previous?.entities || []).map((entity) => [entity.id, entity]))
  for (const entity of current.entities || []) {
    const before = previousEntities.get(entity.id)
    if (!before) {
      statements.push(postgresCreateTableFromSnapshot(entity))
      continue
    }
    const previousFields = new Map((before.fields || []).map((field) => [field.id, field]))
    for (const field of entity.fields || []) {
      if (previousFields.has(field.id)) continue
      statements.push(postgresAddColumn(entity, field))
    }
    for (const field of before.fields || []) {
      const next = (entity.fields || []).find((item) => item.id === field.id)
      if (!next) statements.push(`-- Column ${field.column} was removed from intent for table ${entity.table}. IntentStack does not drop columns automatically.`)
      else if (field.type !== next.type) statements.push(`-- Column ${field.column} changed type from ${field.type} to ${next.type}. Add an explicit PostgreSQL ALTER TYPE migration before deploying.`)
    }
  }
  for (const entity of previous?.entities || []) {
    if (!(current.entities || []).some((item) => item.id === entity.id)) {
      statements.push(`-- Table ${entity.table} was removed from intent. IntentStack does not drop tables automatically.`)
    }
  }
  if (statements.length === 0) statements.push('-- No database changes detected.')
  return `-- @generated by IntentStack. Schema evolution migration.\n\n${statements.join('\n\n')}\n`
}

function sqliteCreateTableFromSnapshot(entity) {
  const lines = (entity.fields || []).map((field) => `  ${field.column} ${sqliteSnapshotSqlType(field)}${sqliteColumnConstraints(field)}`)
  return `CREATE TABLE IF NOT EXISTS ${entity.table} (\n${lines.join(',\n')}\n);`
}

function postgresCreateTableFromSnapshot(entity) {
  const lines = (entity.fields || []).map((field) => `  ${field.column} ${postgresSnapshotSqlType(field)}${postgresColumnConstraints(field)}`)
  return `CREATE TABLE IF NOT EXISTS ${entity.table} (\n${lines.join(',\n')}\n);`
}

function sqliteAddColumn(entity, field) {
  return `ALTER TABLE ${entity.table} ADD COLUMN ${field.column} ${sqliteSnapshotSqlType(field)}${sqliteColumnConstraints(field, { forAddColumn: true })};`
}

function postgresAddColumn(entity, field) {
  return `ALTER TABLE ${entity.table} ADD COLUMN ${field.column} ${postgresSnapshotSqlType(field)}${postgresColumnConstraints(field, { forAddColumn: true })};`
}

function sqliteSnapshotSqlType(field) {
  return SQLITE_SQLTYPE[field.type] || field.type || 'text'
}

function postgresSnapshotSqlType(field) {
  if (field.primary_key) return 'serial'
  return POSTGRES_SQLTYPE[field.type] || field.type || 'text'
}

function sqliteColumnConstraints(field, opts = {}) {
  if (field.primary_key) return ' PRIMARY KEY AUTOINCREMENT NOT NULL'
  let out = ''
  const defaultValue = field.default !== undefined ? sqliteDefault(field.default) : opts.forAddColumn && field.required ? sqliteRequiredFallbackDefault(field.type) : null
  if (defaultValue != null) out += ` DEFAULT ${defaultValue}`
  if (field.required) out += ' NOT NULL'
  return out
}

function postgresColumnConstraints(field, opts = {}) {
  if (field.primary_key) return ' PRIMARY KEY'
  let out = ''
  const defaultValue = field.default !== undefined ? postgresDefault(field.default) : opts.forAddColumn && field.required ? postgresRequiredFallbackDefault(field.type) : null
  if (defaultValue != null) out += ` DEFAULT ${defaultValue}`
  if (field.required) out += ' NOT NULL'
  return out
}

function sqliteDefault(value) {
  return typeof value === 'string' ? `'${value.replaceAll("'", "''")}'` : String(value)
}

function postgresDefault(value) {
  return typeof value === 'string' ? `'${value.replaceAll("'", "''")}'` : String(value)
}

function sqliteRequiredFallbackDefault(type) {
  if (type === 'number') return '0'
  if (type === 'boolean') return '0'
  if (type === 'datetime') return '0'
  return "''"
}

function postgresRequiredFallbackDefault(type) {
  if (type === 'number') return '0'
  if (type === 'boolean') return 'false'
  if (type === 'datetime') return "'1970-01-01T00:00:00Z'"
  return "''"
}

function sqliteClientTs({ banner, pathImports, pathPrelude = '', migrationManifestPathExpr, functionName, memoized }) {
  const runner = memoized
    ? `let migrated: Promise<void> | null = null
export async function runIntentStackMigrations() {
  await runMigrations()
}

export function ${functionName}() {
  if (process.env.INTENTSTACK_AUTO_MIGRATE === 'false') return Promise.resolve()
  if (!migrated) migrated = runMigrations()
  return migrated
}
`
    : `export async function runIntentStackMigrations() {
  await runMigrations()
}

export async function ${functionName}() {
  if (process.env.INTENTSTACK_AUTO_MIGRATE === 'false') return
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
type MigrationManifest = {
  migrations?: Array<{ id: string; file: string; checksum?: string }>
}

const MIGRATION_MANIFEST = ${migrationManifestPathExpr}

function migrationEntries() {
  const manifest = JSON.parse(readFileSync(MIGRATION_MANIFEST, 'utf8')) as MigrationManifest
  return (manifest.migrations || []).map((migration) => ({
    id: migration.id,
    path: join(dirname(MIGRATION_MANIFEST), migration.file),
    checksum: migration.checksum,
  }))
}

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
  for (const migration of migrationEntries()) {
    const sql = readFileSync(migration.path, 'utf8')
    const hash = checksum(sql)
    if (migration.checksum && migration.checksum !== hash) throw new Error(\`Migration \${migration.id} does not match manifest checksum.\`)
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

function postgresClientTs({ banner, pathImports, pathPrelude = '', migrationManifestPathExpr, functionName, memoized }) {
  const runner = memoized
    ? `let migrated: Promise<void> | null = null
export async function runIntentStackMigrations() {
  await runMigrations()
}

export function ${functionName}() {
  if (process.env.INTENTSTACK_AUTO_MIGRATE === 'false') return Promise.resolve()
  if (!migrated) migrated = runMigrations()
  return migrated
}
`
    : `export async function runIntentStackMigrations() {
  await runMigrations()
}

export async function ${functionName}() {
  if (process.env.INTENTSTACK_AUTO_MIGRATE === 'false') return
  await runMigrations()
}
`
  return banner + `import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
${pathImports}

const url = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/intentstack'
export const client = postgres(url, { max: 1 })
export const db = drizzle(client)
${pathPrelude}
type MigrationManifest = {
  migrations?: Array<{ id: string; file: string; checksum?: string }>
}

const MIGRATION_MANIFEST = ${migrationManifestPathExpr}

function migrationEntries() {
  const manifest = JSON.parse(readFileSync(MIGRATION_MANIFEST, 'utf8')) as MigrationManifest
  return (manifest.migrations || []).map((migration) => ({
    id: migration.id,
    path: join(dirname(MIGRATION_MANIFEST), migration.file),
    checksum: migration.checksum,
  }))
}

async function ensureMigrationTable() {
  await client\`
    CREATE TABLE IF NOT EXISTS __intentstack_migrations (
      id text PRIMARY KEY NOT NULL,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL
    )
  \`
}

function checksum(sql: string) {
  return createHash('sha256').update(sql).digest('hex')
}

async function migrationRecord(id: string) {
  const rows = await client\`SELECT checksum FROM __intentstack_migrations WHERE id = \${id}\`
  return rows[0] as { checksum?: string } | undefined
}

async function markApplied(id: string, hash: string) {
  await client\`INSERT INTO __intentstack_migrations (id, checksum, applied_at) VALUES (\${id}, \${hash}, now())\`
}

async function executeSqlScript(sqlText: string) {
  for (const statement of sqlText.split(';').map((part) => part.trim()).filter(Boolean)) {
    await client.unsafe(statement)
  }
}

async function runMigrations() {
  await ensureMigrationTable()
  for (const migration of migrationEntries()) {
    const sqlText = readFileSync(migration.path, 'utf8')
    const hash = checksum(sqlText)
    if (migration.checksum && migration.checksum !== hash) throw new Error(\`Migration \${migration.id} does not match manifest checksum.\`)
    const existing = await migrationRecord(migration.id)
    if (existing) {
      if (existing.checksum !== hash) throw new Error(\`Migration \${migration.id} was already applied with a different checksum.\`)
      continue
    }
    await executeSqlScript(sqlText)
    await markApplied(migration.id, hash)
  }
}

${runner}`
}

function checksum(sql) {
  return createHash('sha256').update(sql).digest('hex')
}
