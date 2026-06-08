// Shared data-model facade. Entity validators and client needs are target-agnostic;
// database-specific schema, SQL and migration metadata are delegated to db_driver.
import { dbDriver } from './db_driver.js'

const q = (s) => `'${s}'`

export const schemaImports = (graph) => dbDriver(graph).schemaImports(graph)

export const schemaBody = (graph) => dbDriver(graph).schemaBody(graph)

export const migrationSql = (graph) => dbDriver(graph).migrationSql(graph)

export const migrationRollbackSql = (graph) => dbDriver(graph).rollbackMigrationSql({ entities: [] }, dbDriver(graph).schemaSnapshot(graph))

export const migrationManifest = (graph) => dbDriver(graph).migrationManifest(graph)

function zodFor(f) {
  let z
  switch (f.type) {
    case 'number': z = 'z.coerce.number()'; break
    case 'boolean': z = 'z.coerce.boolean()'; break
    case 'enum': z = `z.enum([${(f.values || []).map((v) => q(v)).join(', ')}])`; break
    case 'datetime': z = 'z.coerce.date()'; break
    default: z = 'z.string()' + (f.required ? '.min(1)' : '')
  }
  if (!f.required) z += '.optional()'
  return z
}

export function validatorBody(e) {
  let out = `import { z } from 'zod'\n\n`
  out += `export const ${e.id.toLowerCase()}CreateSchema = z.object({\n`
  for (const f of e.fields || []) out += `  ${f.id}: ${zodFor(f)},\n`
  out += `})\n\nexport type ${e.id}Create = z.infer<typeof ${e.id.toLowerCase()}CreateSchema>\n`
  return out
}

// Which client functions an entity needs, derived from its record actions.
export function entityClientNeeds(graph) {
  const byEntity = {}
  for (const a of graph.actions) {
    if (!a.entity) continue
    ;(byEntity[a.entity] ||= new Set()).add(a.type)
  }
  return byEntity
}
