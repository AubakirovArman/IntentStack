// Build the Core IR / AppGraph from parsed intent (PRD 6.2).
// This representation knows nothing about React, Hono, or Drizzle - only the domain.

import { normalize } from './normalize.js'
import { buildReferenceGraph } from './reference_graph.js'

export function buildGraph(ast) {
  ast = normalize(ast)
  const project = ast.project || {}
  const theme = ast.theme || {}
  const entities = ast.entities || []
  const actions = ast.actions || []
  const pages = ast.pages || []
  const auth = ast.auth || null
  const tenancy = ast.tenancy || null
  const navigation = ast.navigation || null
  const workflows = ast.workflows || []
  const integrations = ast.integrations || []
  const modules = ast.__intentstack ? {
    modular: ast.__intentstack.modular,
    rootPath: ast.__intentstack.rootPath,
    includes: ast.__intentstack.includes || [],
    sourceFiles: ast.__intentstack.sourceFiles || [],
    owners: ast.__intentstack.owners || {},
    pathFiles: ast.__intentstack.pathFiles || {},
    includeGraph: ast.__intentstack.includeGraph || { nodes: [], edges: [] },
    includeCycles: ast.__intentstack.includeCycles || [],
  } : { modular: false, includes: [], sourceFiles: [], owners: {}, pathFiles: {}, includeGraph: { nodes: [], edges: [] }, includeCycles: [] }

  const entityById = Object.fromEntries(entities.map((e) => [e.id, e]))
  const actionById = Object.fromEntries(actions.map((a) => [a.id, a]))
  const pageById = Object.fromEntries(pages.map((p) => [p.id, p]))
  const sectionByRef = {}
  for (const page of pages) {
    for (const section of page.sections || []) {
      sectionByRef[sectionRef(page.id, section.id)] = section
    }
  }
  const symbols = buildSymbols({ entities, actions, pages, workflows, integrations })
  const types = buildTypes({ entities, actions, pages, entityById })
  const resolved = buildResolved({ actions, pages, workflows, entityById, actionById, integrations })
  const bindings = buildBindings({ actions, pages, workflows })

  const graph = {
    version: ast.version,
    project,
    theme,
    entities,
    actions,
    pages,
    auth,
    tenancy,
    navigation,
    workflows,
    integrations,
    modules,
    entityById,
    actionById,
    pageById,
    sectionByRef,
    symbols,
    symbolTable: Object.values(symbols),
    types,
    resolved,
    bindings,
    getEntity: (id) => entityById[id],
    getAction: (id) => actionById[id],
    getSection: (pageId, sectionId) => sectionByRef[sectionRef(pageId, sectionId)],
    getField: (entityId, fieldId) => entityById[entityId]?.fields?.find((field) => field.id === fieldId) || null,
    getResolvedSection: (pageId, sectionId) => resolved.sections[sectionRef(pageId, sectionId)] || null,
  }
  graph.referenceGraph = buildReferenceGraph(graph)
  return graph
}

function sectionRef(pageId, sectionId) {
  return `Page.${pageId}.section.${sectionId}`
}

function fieldRefId(ref) {
  if (typeof ref === 'string') return ref
  return ref?.id || ref?.name || null
}

function buildSymbols({ entities, actions, pages, workflows, integrations }) {
  const symbols = {}
  const add = (ref, symbol) => { if (ref) symbols[ref] = { ref, ...symbol } }
  for (const entity of entities) {
    add(`Entity.${entity.id}`, { kind: 'entity', id: entity.id })
    for (const field of entity.fields || []) {
      add(`Entity.${entity.id}.field.${field.id}`, {
        kind: 'field',
        id: field.id,
        owner: `Entity.${entity.id}`,
        type: field.type || 'string',
        required: field.required === true,
      })
    }
  }
  for (const action of actions) add(`Action.${action.id}`, { kind: 'action', id: action.id, action_type: action.type, entity: action.entity || null })
  for (const page of pages) {
    add(`Page.${page.id}`, { kind: 'page', id: page.id, path: page.path })
    for (const section of page.sections || []) {
      add(sectionRef(page.id, section.id), { kind: 'section', id: section.id, section_type: section.type, page: page.id })
    }
  }
  for (const workflow of workflows) add(`Workflow.${workflow.id}`, { kind: 'workflow', id: workflow.id })
  for (const integration of integrations) add(`Integration.${integration.id}`, { kind: 'integration', id: integration.id, integration_type: integration.type })
  return symbols
}

function buildTypes({ entities, actions, pages, entityById }) {
  const entityTypes = {}
  for (const entity of entities) {
    entityTypes[entity.id] = {
      table: entity.table || entity.id.toLowerCase(),
      fields: Object.fromEntries((entity.fields || []).map((field) => [field.id, {
        type: field.type || 'string',
        required: field.required === true,
        values: field.values || null,
        default: field.default,
      }])),
    }
  }
  const actionTypes = Object.fromEntries(actions.map((action) => [action.id, {
    action_type: action.type,
    entity: action.entity || null,
    input: ['create_record', 'update_record'].includes(action.type) && action.entity ? `Entity.${action.entity}.input` : null,
    output: action.entity ? actionOutputType(action.type, action.entity) : null,
  }]))
  const sectionTypes = {}
  for (const page of pages) {
    for (const section of page.sections || []) {
      const entity = section.entity ? entityById[section.entity] : null
      sectionTypes[sectionRef(page.id, section.id)] = {
        section_type: section.type,
        entity: section.entity || null,
        fields: resolveFieldTypes(entity, sectionFieldRefs(section)),
      }
    }
  }
  return { entities: entityTypes, actions: actionTypes, sections: sectionTypes }
}

function actionOutputType(type, entityId) {
  if (type === 'list_records') return `Array<Entity.${entityId}>`
  if (type === 'subscribe_records') return `Stream<Array<Entity.${entityId}>>`
  if (['create_record', 'get_record', 'update_record'].includes(type)) return `Entity.${entityId}`
  if (type === 'delete_record') return '{ ok: boolean }'
  return null
}

function resolveFieldTypes(entity, refs) {
  const fields = {}
  for (const ref of refs || []) {
    const id = fieldRefId(ref)
    if (!id) continue
    const field = (entity?.fields || []).find((item) => item.id === id)
    fields[id] = field ? {
      type: field.type || 'string',
      required: field.required === true,
      ref: `Entity.${entity.id}.field.${field.id}`,
    } : { type: 'unknown', required: false, ref: null }
  }
  return fields
}

function buildResolved({ actions, pages, workflows, entityById, actionById, integrations }) {
  const integrationById = Object.fromEntries((integrations || []).map((item) => [item.id, item]))
  const resolved = {
    actions: {},
    sections: {},
    workflows: {},
  }
  for (const action of actions) {
    resolved.actions[action.id] = {
      entity: action.entity ? entityById[action.entity] || null : null,
    }
  }
  for (const page of pages) {
    for (const section of page.sections || []) {
      const entity = section.entity ? entityById[section.entity] || null : null
      resolved.sections[sectionRef(page.id, section.id)] = {
        entity,
        submitAction: section.submit?.action ? actionById[section.submit.action] || null : null,
        sourceAction: section.source?.action ? actionById[section.source.action] || null : null,
        fields: resolveFields(entity, sectionFieldRefs(section)),
      }
    }
  }
  for (const workflow of workflows) {
    resolved.workflows[workflow.id] = {
      triggerAction: workflow.trigger?.action ? actionById[workflow.trigger.action] || null : null,
      integrations: (workflow.steps || []).map((step) => step.integration ? integrationById[step.integration] || null : null),
    }
  }
  return resolved
}

function resolveFields(entity, refs) {
  return (refs || []).map((ref) => {
    const id = fieldRefId(ref)
    const field = (entity?.fields || []).find((item) => item.id === id) || null
    return {
      id,
      ref: field && entity ? `Entity.${entity.id}.field.${field.id}` : null,
      field,
    }
  })
}

function sectionFieldRefs(section) {
  if (['form', 'record_detail'].includes(section.type)) return Array.isArray(section.fields) ? section.fields : []
  if (section.type === 'table') return Array.isArray(section.columns) ? section.columns : []
  return []
}

function buildBindings({ actions, pages, workflows }) {
  const bindings = []
  for (const action of actions) {
    if (action.entity) bindings.push({ kind: 'action.entity', from: `Action.${action.id}`, to: `Entity.${action.entity}` })
  }
  for (const page of pages) {
    for (const section of page.sections || []) {
      const from = sectionRef(page.id, section.id)
      if (section.entity) bindings.push({ kind: 'section.entity', from, to: `Entity.${section.entity}` })
      if (section.submit?.action) bindings.push({ kind: 'form.submit', from, to: `Action.${section.submit.action}` })
      if (section.source?.action) bindings.push({ kind: `${section.type}.source`, from, to: `Action.${section.source.action}` })
    }
  }
  for (const workflow of workflows) {
    if (workflow.trigger?.action) bindings.push({ kind: 'workflow.trigger', from: `Workflow.${workflow.id}`, to: `Action.${workflow.trigger.action}` })
    for (const step of workflow.steps || []) {
      if (step.integration) bindings.push({ kind: 'workflow.integration', from: `Workflow.${workflow.id}`, to: `Integration.${step.integration}` })
    }
  }
  return bindings
}
