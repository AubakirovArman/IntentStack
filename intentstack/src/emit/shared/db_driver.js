import { sqlite } from './db/sqlite.js'
import { postgres } from './db/postgres.js'
import { schemaChecksum } from './db/common.js'

function makeDriver(driver) {
  const manifestFile = driver.manifestFile ?? 'migrations/manifest.json'
  const migrationFile = driver.migrationFile ?? 'migrations/0000_init.sql'
  return {
    ...driver,
    migrationManifest(graph) {
      const initSql = driver.migrationSql(graph)
      const rollbackSql = driver.rollbackMigrationSql?.({ entities: [] }, driver.schemaSnapshot(graph)) || '-- No rollback available.\n'
      const snapshot = driver.schemaSnapshot(graph)
      const rollbackFile = migrationFile.replace(/\.sql$/, '.down.sql')
      return JSON.stringify({
        version: 1,
        driver: driver.id,
        schema_checksum: schemaChecksum(snapshot),
        schema: snapshot,
        migrations: [
          {
            id: '0000_init',
            file: migrationFile,
            checksum: driver.schemaChecksum
              ? driver.schemaChecksum(initSql)
              : schemaChecksum(initSql),
            rollback_file: rollbackFile,
            rollback_checksum: schemaChecksum(rollbackSql),
          },
        ],
      }, null, 2) + '\n'
    },
    manifestFile,
    migrationFile,
  }
}

const drivers = {
  sqlite: makeDriver(sqlite),
  postgres: makeDriver(postgres),
}

export const DB_DRIVERS = {
  sqlite: drivers.sqlite,
  postgres: drivers.postgres,
}

export const DATABASE_DRIVER_IDS = Object.keys(DB_DRIVERS)

export function dbDriver(graph) {
  const id = graph.database?.driver || graph.project?.database?.driver || 'sqlite'
  const driver = DB_DRIVERS[id]
  if (!driver) {
    throw new Error(`Unsupported database driver "${id}". Available: ${Object.keys(DB_DRIVERS).join(', ')}`)
  }
  return driver
}
