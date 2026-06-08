// web_ts_minimal database placement: shared data-model content + a Hono-style client
// that applies the migration on boot.
import { BANNER_TS } from './util.js'
import { schemaImports, schemaBody, migrationSql, migrationRollbackSql, migrationManifest, validatorBody } from './shared/datamodel.js'
import { dbDriver } from './shared/db_driver.js'

export function emitDatabase(graph) {
  const files = {}
  const driver = dbDriver(graph)
  files['server/generated/db/schema.ts'] = BANNER_TS + schemaImports(graph) + schemaBody(graph)
  files['server/generated/db/client.ts'] = driver.clientTs({
    banner: BANNER_TS,
    functionName: 'migrate',
    memoized: false,
    pathImports: `import { fileURLToPath } from 'node:url'\nimport { dirname, join } from 'node:path'`,
    pathPrelude: `\nconst here = dirname(fileURLToPath(import.meta.url))\n`,
    migrationManifestPathExpr: `join(here, '../../../migrations/manifest.json')`,
  })
  files['server/generated/db/migration_runtime.ts'] = driver.migrationRuntimeTs(BANNER_TS)
  files['server/generated/db/migrate.ts'] = BANNER_TS + `import { checkIntentStackSchemaDrift, rollbackIntentStackMigration, runIntentStackMigrations } from './client'

async function main() {
  const args = new Set(process.argv.slice(2))
  if (args.has('--drift')) {
    const report = await checkIntentStackSchemaDrift()
    console.log(JSON.stringify(report, null, 2))
    if (!report.ok) process.exitCode = 1
    return
  }
  if (args.has('--rollback')) {
    const result = await rollbackIntentStackMigration()
    console.log(result.rolled_back ? '[intentstack] rolled back ' + result.id : '[intentstack] no applied migration to roll back')
    return
  }
  await runIntentStackMigrations()
  console.log('[intentstack] migrations applied')
}

main()
  .then(() => {
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
`
  files[driver.migrationFile] = migrationSql(graph)
  files[driver.migrationFile.replace(/\.sql$/, '.down.sql')] = migrationRollbackSql(graph)
  files[driver.manifestFile] = migrationManifest(graph)
  for (const e of graph.entities) {
    files[`server/generated/validators/${e.id.toLowerCase()}.ts`] = BANNER_TS + validatorBody(e)
  }
  return files
}
