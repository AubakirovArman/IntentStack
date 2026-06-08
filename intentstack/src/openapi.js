import YAML from 'js-yaml'
import { ENTITY_ACTIONS } from './registry.js'
import { hasActionAuth, hasPageAuth } from './emit/shared/modules.js'
import { tenancyConfig } from './emit/shared/tenancy.js'
import { groupRecordActions, buildEntitySchemas } from './openapi/schema_builders.js'
import {
  listOperation,
  createOperation,
  getOperation,
  updateOperation,
  deleteOperation,
  subscribeOperation,
  addAuthPaths,
  addObservabilityPaths,
} from './openapi/operation_builders.js'

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
    spec.components.schemas[entity.id] = buildEntitySchemas(entity, { includeGenerated: true, tenancy })
    spec.components.schemas[`${entity.id}Input`] = buildEntitySchemas(entity, { includeGenerated: false })
    spec.components.schemas[`${entity.id}Patch`] = buildEntitySchemas(entity, { includeGenerated: false, partial: true })
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

  const byEntity = groupRecordActions(graph, ENTITY_ACTIONS)
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
