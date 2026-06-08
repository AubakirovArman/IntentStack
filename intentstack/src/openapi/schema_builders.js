import { isActivePolicy } from '../emit/shared/modules.js'

export function groupRecordActions(graph, ENTITY_ACTIONS) {
  const byEntity = {}
  for (const action of graph.actions) {
    if (!action.entity || !ENTITY_ACTIONS.includes(action.type)) continue
    ;(byEntity[action.entity] ||= []).push(action)
  }
  return byEntity
}

export function buildEntitySchemas(entity, opts = {}) {
  const properties = {}
  const required = []
  if (opts.includeGenerated) {
    properties.id = { type: 'integer' }
    if (opts.tenancy) properties.tenantId = { type: 'string' }
    properties.createdAt = { type: 'string', format: 'date-time' }
  }
  for (const field of entity.fields || []) {
    properties[field.id] = fieldSchema(field)
    if (!opts.partial && field.required === true) required.push(field.id)
  }
  const schema = { type: 'object', additionalProperties: false, properties }
  if (required.length > 0) schema.required = required
  return schema
}

export function fieldSchema(field) {
  if (field.type === 'number') return titled(field, { type: 'number' })
  if (field.type === 'boolean') return titled(field, { type: 'boolean' })
  if (field.type === 'datetime') return titled(field, { type: 'string', format: 'date-time' })
  if (field.type === 'enum') return titled(field, { type: 'string', enum: field.values || [] })
  return titled(field, { type: 'string' })
}

export function titled(field, schema) {
  if (!field.label) return schema
  return { ...schema, title: field.label }
}

export function jsonRequest(schema) {
  return {
    required: true,
    content: {
      'application/json': { schema },
    },
  }
}

export function jsonResponse(schema) {
  return {
    description: 'OK',
    content: {
      'application/json': { schema },
    },
  }
}

export function jsonEnvelope(schema) {
  return jsonResponse({
    type: 'object',
    properties: {
      data: schema,
    },
  })
}

export function errorResponse() {
  return {
    description: 'Error',
    content: {
      'application/json': { schema: ref('Error') },
    },
  }
}

export function idParam() {
  return {
    name: 'id',
    in: 'path',
    required: true,
    schema: { type: 'integer' },
  }
}

export function csrfParam() {
  return {
    name: 'X-CSRF-Token',
    in: 'header',
    required: true,
    schema: { type: 'string' },
  }
}

export function tenantParam(tenancy) {
  return {
    name: tenancy.header,
    in: 'header',
    required: true,
    schema: { type: 'string' },
  }
}

export function ref(name) {
  return { $ref: `#/components/schemas/${name}` }
}

export function isSecured(policy) {
  return isActivePolicy(policy)
}
