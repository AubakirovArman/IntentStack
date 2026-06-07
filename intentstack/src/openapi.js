import YAML from 'js-yaml'
import { ENTITY_ACTIONS } from './registry.js'
import { hasActionAuth, hasPageAuth, isActivePolicy, policyRoles } from './emit/shared/modules.js'
import { tenancyConfig } from './emit/shared/tenancy.js'

export function generateOpenApi(graph) {
  const tenancy = tenancyConfig(graph)
  const spec = {
    openapi: '3.1.0',
    info: {
      title: graph.project?.name || graph.project?.id || 'IntentStack App',
      version: String(graph.version ?? '0.1'),
    },
    tags: graph.entities.map((entity) => ({ name: entity.id })),
    paths: {},
    components: {
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            details: {},
          },
        },
      },
      securitySchemes: {},
    },
  }

  for (const entity of graph.entities) {
    spec.components.schemas[entity.id] = entitySchema(entity, { includeGenerated: true, tenancy })
    spec.components.schemas[`${entity.id}Input`] = entitySchema(entity, { includeGenerated: false })
    spec.components.schemas[`${entity.id}Patch`] = entitySchema(entity, { includeGenerated: false, partial: true })
  }

  if (hasActionAuth(graph.actions) || hasPageAuth(graph)) {
    spec.components.securitySchemes.intentstackSession = {
      type: 'apiKey',
      in: 'cookie',
      name: 'intentstack_session',
    }
    addAuthPaths(spec)
  }
  addObservabilityPaths(spec)

  const byEntity = groupRecordActions(graph)
  for (const [entityId, actions] of Object.entries(byEntity)) {
    const entity = graph.getEntity(entityId)
    if (!entity) continue
    const base = entity.table || entity.id.toLowerCase()
    const collectionPath = `/api/${base}`
    const itemPath = `/api/${base}/{id}`
    const action = (type) => actions.find((item) => item.type === type)
    const list = action('list_records')
    const create = action('create_record')
    const get = action('get_record')
    const update = action('update_record')
    const remove = action('delete_record')
    const subscribe = action('subscribe_records')

    if (list || create) {
      spec.paths[collectionPath] ||= {}
      if (list) spec.paths[collectionPath].get = listOperation(entity, list, tenancy)
      if (create) spec.paths[collectionPath].post = createOperation(entity, create, tenancy)
    }
    if (get || update || remove) {
      spec.paths[itemPath] ||= {}
      if (get) spec.paths[itemPath].get = getOperation(entity, get, tenancy)
      if (update) spec.paths[itemPath].put = updateOperation(entity, update, tenancy)
      if (remove) spec.paths[itemPath].delete = deleteOperation(entity, remove, tenancy)
    }
    if (subscribe) {
      spec.paths[`/api/${base}/stream`] = {
        get: subscribeOperation(entity, subscribe, tenancy),
      }
    }
  }

  return spec
}

export function formatOpenApi(spec, format = 'json') {
  if (format === 'yaml') return YAML.dump(spec, { lineWidth: 120, noRefs: true })
  return JSON.stringify(spec, null, 2) + '\n'
}

export function openApiFormat({ out, yaml }) {
  if (yaml) return 'yaml'
  return /\.(ya?ml)$/i.test(out || '') ? 'yaml' : 'json'
}

function groupRecordActions(graph) {
  const byEntity = {}
  for (const action of graph.actions) {
    if (!action.entity || !ENTITY_ACTIONS.includes(action.type)) continue
    ;(byEntity[action.entity] ||= []).push(action)
  }
  return byEntity
}

function entitySchema(entity, opts = {}) {
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

function fieldSchema(field) {
  if (field.type === 'number') return titled(field, { type: 'number' })
  if (field.type === 'boolean') return titled(field, { type: 'boolean' })
  if (field.type === 'datetime') return titled(field, { type: 'string', format: 'date-time' })
  if (field.type === 'enum') return titled(field, { type: 'string', enum: field.values || [] })
  return titled(field, { type: 'string' })
}

function titled(field, schema) {
  if (!field.label) return schema
  return { ...schema, title: field.label }
}

function listOperation(entity, action, tenancy) {
  return tenanted(secure(action, false, {
    tags: [entity.id],
    operationId: action.id,
    summary: `List ${entity.id} records`,
    responses: {
      200: jsonResponse({
        type: 'array',
        items: ref(entity.id),
      }),
      403: errorResponse(),
    },
  }), tenancy)
}

function createOperation(entity, action, tenancy) {
  return tenanted(secure(action, true, {
    tags: [entity.id],
    operationId: action.id,
    summary: `Create ${entity.id}`,
    requestBody: jsonRequest(ref(`${entity.id}Input`)),
    responses: {
      201: jsonEnvelope(ref(entity.id)),
      400: errorResponse(),
      403: errorResponse(),
    },
  }), tenancy)
}

function getOperation(entity, action, tenancy) {
  return tenanted(secure(action, false, {
    tags: [entity.id],
    operationId: action.id,
    summary: `Get ${entity.id}`,
    parameters: [idParam()],
    responses: {
      200: jsonEnvelope(ref(entity.id)),
      403: errorResponse(),
      404: errorResponse(),
    },
  }), tenancy)
}

function updateOperation(entity, action, tenancy) {
  return tenanted(secure(action, true, {
    tags: [entity.id],
    operationId: action.id,
    summary: `Update ${entity.id}`,
    parameters: [idParam()],
    requestBody: jsonRequest(ref(`${entity.id}Patch`)),
    responses: {
      200: jsonEnvelope(ref(entity.id)),
      400: errorResponse(),
      403: errorResponse(),
      404: errorResponse(),
    },
  }), tenancy)
}

function deleteOperation(entity, action, tenancy) {
  return tenanted(secure(action, true, {
    tags: [entity.id],
    operationId: action.id,
    summary: `Delete ${entity.id}`,
    parameters: [idParam()],
    responses: {
      200: jsonResponse({
        type: 'object',
        properties: { ok: { type: 'boolean' } },
      }),
      403: errorResponse(),
      404: errorResponse(),
    },
  }), tenancy)
}

function subscribeOperation(entity, action, tenancy) {
  return tenanted(secure(action, false, {
    tags: [entity.id],
    operationId: action.id,
    summary: `Subscribe to ${entity.id} records`,
    responses: {
      200: {
        description: 'Server-sent event stream of record snapshots.',
        content: {
          'text/event-stream': {
            schema: { type: 'string' },
          },
        },
      },
      403: errorResponse(),
    },
  }), tenancy)
}

function secure(action, csrf, operation) {
  if (!isActivePolicy(action.auth)) return operation
  const secured = {
    ...operation,
    security: [{ intentstackSession: [] }],
    'x-intentstack-roles': policyRoles(action.auth),
  }
  if (csrf) secured.parameters = [...(operation.parameters || []), csrfParam()]
  return secured
}

function tenanted(operation, tenancy) {
  if (!tenancy) return operation
  return {
    ...operation,
    parameters: [...(operation.parameters || []), tenantParam(tenancy)],
    responses: {
      ...operation.responses,
      400: operation.responses?.[400] || errorResponse(),
    },
  }
}

function jsonRequest(schema) {
  return {
    required: true,
    content: {
      'application/json': { schema },
    },
  }
}

function jsonResponse(schema) {
  return {
    description: 'OK',
    content: {
      'application/json': { schema },
    },
  }
}

function jsonEnvelope(schema) {
  return jsonResponse({
    type: 'object',
    properties: {
      data: schema,
    },
  })
}

function errorResponse() {
  return {
    description: 'Error',
    content: {
      'application/json': { schema: ref('Error') },
    },
  }
}

function idParam() {
  return {
    name: 'id',
    in: 'path',
    required: true,
    schema: { type: 'integer' },
  }
}

function csrfParam() {
  return {
    name: 'X-CSRF-Token',
    in: 'header',
    required: true,
    schema: { type: 'string' },
  }
}

function tenantParam(tenancy) {
  return {
    name: tenancy.header,
    in: 'header',
    required: true,
    schema: { type: 'string' },
  }
}

function ref(name) {
  return { $ref: `#/components/schemas/${name}` }
}

function addAuthPaths(spec) {
  spec.paths['/api/auth/login'] = {
    post: {
      tags: ['Auth'],
      operationId: 'login',
      summary: 'Create an IntentStack session',
      requestBody: jsonRequest({
        type: 'object',
        properties: {
          username: { type: 'string' },
          id: { type: 'string' },
          password: { type: 'string', format: 'password' },
        },
      }),
      responses: {
        200: jsonResponse({
          type: 'object',
          properties: {
            token: { type: 'string' },
            csrf_token: { type: 'string' },
            expires_in: { type: 'integer' },
            role: { type: 'string' },
            user: { type: ['string', 'null'] },
          },
        }),
        401: errorResponse(),
      },
    },
  }
  spec.paths['/api/auth/logout'] = {
    post: {
      tags: ['Auth'],
      operationId: 'logout',
      summary: 'Clear the current IntentStack session',
      security: [{ intentstackSession: [] }],
      parameters: [csrfParam()],
      responses: {
        200: jsonResponse({
          type: 'object',
          properties: { ok: { type: 'boolean' } },
        }),
      },
    },
  }
  spec.paths['/api/auth/me'] = {
    get: {
      tags: ['Auth'],
      operationId: 'me',
      summary: 'Read current session metadata',
      responses: {
        200: jsonResponse({
          type: 'object',
          properties: {
            authenticated: { type: 'boolean' },
            role: { type: ['string', 'null'] },
            user: { type: ['string', 'null'] },
          },
        }),
      },
    },
  }
}

function addObservabilityPaths(spec) {
  spec.paths['/api/health'] = {
    get: {
      tags: ['Observability'],
      operationId: 'health',
      summary: 'Read generated app health status',
      responses: {
        200: jsonResponse({
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
          },
        }),
      },
    },
  }
  spec.paths['/api/metrics'] = {
    get: {
      tags: ['Observability'],
      operationId: 'metrics',
      summary: 'Read generated app runtime metrics',
      responses: {
        200: jsonResponse({
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            uptime_seconds: { type: 'number' },
            started_at: { type: 'string', format: 'date-time' },
            requests_total: { type: 'integer' },
          },
        }),
      },
    },
  }
}
