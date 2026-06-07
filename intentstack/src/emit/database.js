// web_ts_minimal database placement: shared data-model content + a Hono-style client
// that applies the migration on boot.
import { BANNER_TS } from './util.js'
import { schemaImports, schemaBody, migrationSql, validatorBody } from './shared/datamodel.js'
import { dbDriver } from './shared/db_driver.js'

export function emitDatabase(graph) {
  const files = {}
  const driver = dbDriver(graph)
  files['server/generated/db/schema.ts'] = BANNER_TS + schemaImports() + schemaBody(graph)
  files['server/generated/db/client.ts'] = driver.clientTs({
    banner: BANNER_TS,
    functionName: 'migrate',
    memoized: false,
    pathImports: `import { fileURLToPath } from 'node:url'\nimport { dirname, join } from 'node:path'`,
    pathPrelude: `\nconst here = dirname(fileURLToPath(import.meta.url))\n`,
    migrationPathExpr: `join(here, '../../../migrations/0000_init.sql')`,
  })
  files[driver.migrationFile] = migrationSql(graph)
  for (const e of graph.entities) {
    files[`server/generated/validators/${e.id.toLowerCase()}.ts`] = BANNER_TS + validatorBody(e)
  }
  return files
}
