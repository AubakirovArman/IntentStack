// web_ts_minimal database placement: shared data-model content + a Hono-style client
// that applies the migration on boot.
import { BANNER_TS } from './util.js'
import { schemaImports, schemaBody, migrationSql, validatorBody } from './shared/datamodel.js'

export function emitDatabase(graph) {
  const files = {}
  files['server/generated/db/schema.ts'] = BANNER_TS + schemaImports() + schemaBody(graph)
  files['server/generated/db/client.ts'] = clientTs()
  files['migrations/0000_init.sql'] = migrationSql(graph)
  for (const e of graph.entities) {
    files[`server/generated/validators/${e.id.toLowerCase()}.ts`] = BANNER_TS + validatorBody(e)
  }
  return files
}

function clientTs() {
  return BANNER_TS + `import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const url = process.env.DB_URL ?? 'file:./data.db'
export const client = createClient({ url })
export const db = drizzle(client)

// Apply the generated migration on boot so \`npm run dev\` just works.
export async function migrate() {
  const here = dirname(fileURLToPath(import.meta.url))
  const sql = readFileSync(join(here, '../../../migrations/0000_init.sql'), 'utf8')
  await client.executeMultiple(sql)
}
`
}
