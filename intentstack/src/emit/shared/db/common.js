import { createHash } from 'node:crypto'
import { snake } from '../../util.js'

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

export {
  q,
  col,
  SQLITE_DRIZZLE,
  SQLITE_SQLTYPE,
  POSTGRES_DRIZZLE,
  POSTGRES_SQLTYPE,
}

export function schemaSnapshot(graph) {
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

export function schemaChecksum(schema) {
  return checksum(JSON.stringify(canonical(schema)))
}

export function checksum(sql) {
  return createHash('sha256').update(sql).digest('hex')
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
}
