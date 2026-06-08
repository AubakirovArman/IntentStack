import { Diagnostics, closest } from '../diagnostics.js'
import { TARGETS, FIELD_TYPES, ACTION_TYPES, ENTITY_ACTIONS } from '../registry.js'
import { DATABASE_DRIVER_IDS } from '../emit/shared/db_driver.js'
import { ROOT_KEYS, asArray, attachProvenance, validateNavigation } from './utils.js'
import { validateAuth, validateAuthPolicy, validateTenancy } from './auth.js'
import { validateIntegrations } from './integrations.js'
import { validateWorkflows } from './workflow.js'
import { validateContent, validateForm, validateRecordDetail, validateTable } from './content.js'
import { validateCustomComponent } from './custom.js'
import { entityCycles, entityReferenceTarget } from '../reference_graph.js'
import { runPluginValidators } from '../plugins.js'

export function validate(ast, opts = {}) {
  const d = new Diagnostics()
  if (!ast || typeof ast !== 'object') {
    d.error('E1001', 'Intent file is empty or not an object.')
    return d
  }
  for (const key of Object.keys(ast)) {
    if (!ROOT_KEYS.has(key)) d.error('E2000', `Unknown top-level key "${key}".`, { path: key, suggestion: `Supported: ${[...ROOT_KEYS].join(', ')}` })
  }
  if (ast.version == null) d.warn('W1001', 'Missing "version". Assuming 0.1.', { path: 'version' })
  else if (![0.1, '0.1'].includes(ast.version)) d.error('E0002', `Unsupported DSL version "${ast.version}". This compiler supports 0.1.`, { path: 'version' })

  for (const include of ast.__intentstack?.unresolvedIncludes || []) {
    d.warn('W1100', `Include pattern "${include.pattern}" matched no files.`, {
      path: 'includes',
      file: include.file || ast.__intentstack?.rootPath,
      suggestion: 'Check the include path, create a matching module file, or remove the unused include.',
    })
  }
  for (const cycle of ast.__intentstack?.includeCycles || []) {
    d.error('E1101', `Intent include cycle detected: ${cycle.join(' -> ')}`, {
      path: 'includes',
      file: cycle[0] || ast.__intentstack?.rootPath,
      suggestion: 'Remove one include edge in the cycle or move shared objects behind a root-level include.',
      fix_hint: { kind: 'include_cycle', files: cycle },
    })
  }

  const project = ast.project
  if (!project || !project.id) d.error('E2001', 'project.id is required.', { path: 'project.id' })
  const targetId = project?.target
  const target = TARGETS[targetId]
  if (!targetId) d.error('E2002', 'project.target is required.', { path: 'project.target' })
  else if (!target) {
    d.error('E4001', `Unknown target "${targetId}".`, {
      path: 'project.target',
      suggestion: `Available targets: ${Object.keys(TARGETS).join(', ')}`,
    })
  }
  validateDatabase(d, project?.database)

  validateNavigation(d, ast.navigation)
  validateTenancy(d, ast.tenancy)

  // ---- entities -------------------------------------------------------------
  const entities = asArray(d, ast.entities, 'entities')
  const entityIds = new Set()
  const entityRefChecks = []
  for (const [i, e] of entities.entries()) {
    const base = `entities[${i}]`
    if (!e.id) { d.error('E2010', 'entity.id is required.', { path: base }); continue }
    if (entityIds.has(e.id)) d.error('E2011', `Duplicate entity id "${e.id}".`, { path: `${base}.id` })
    entityIds.add(e.id)
    const fieldIds = new Set()
    const fieldNameKeys = new Map()
    for (const [j, f] of (e.fields || []).entries()) {
      const fp = `${base}.fields[${j}]`
      if (!f.id) { d.error('E2012', 'field.id is required.', { path: fp }); continue }
      if (fieldIds.has(f.id)) d.error('E2013', `Duplicate field "${f.id}" in entity "${e.id}".`, { path: fp })
      const fieldKey = String(f.id).toLowerCase()
      const existingField = fieldNameKeys.get(fieldKey)
      if (existingField && existingField !== f.id) {
        d.error('E2014', `Ambiguous field name "${f.id}" in entity "${e.id}" conflicts with "${existingField}".`, { path: `${fp}.id` })
      } else {
        fieldNameKeys.set(fieldKey, f.id)
      }
      fieldIds.add(f.id)
      if (f.type && !FIELD_TYPES.includes(f.type)) {
        d.error('E4002', `Unsupported field type "${f.type}".`, {
          path: `${fp}.type`, suggestion: `Supported: ${FIELD_TYPES.join(', ')}`,
        })
      }
      const targetEntity = entityReferenceTarget(f)
      if (targetEntity) entityRefChecks.push({ entity: e.id, field: f.id, target: targetEntity, path: fp })
      if (ast.tenancy?.enabled === true && f.id === 'tenantId') {
        d.error('E2310', `Field "tenantId" in entity "${e.id}" is reserved when tenancy.enabled is true.`, {
          path: `${fp}.id`,
          suggestion: 'Remove the field; IntentStack will generate tenantId automatically.',
        })
      }
    }
  }
  for (const ref of entityRefChecks) {
    if (!entityIds.has(ref.target)) {
      d.error('E3005', `Field "${ref.entity}.${ref.field}" references unknown entity "${ref.target}".`, {
        path: ref.path,
        suggestion: `Create entity "${ref.target}" or update the field reference.`,
        fix_hint: { op: 'entity.field.update', entity: ref.entity, field: ref.field, references: null },
      })
    }
  }
  for (const cycle of entityCycles({ entities })) {
    d.error('E3006', `Entity reference cycle detected: ${cycle.refs.join(' -> ')}`, {
      path: 'entities',
      suggestion: 'Break the schema cycle by replacing one direct entity reference with a scalar foreign-key field.',
      fix_hint: { kind: 'entity_reference_cycle', refs: cycle.refs },
    })
  }

  // ---- actions --------------------------------------------------------------
  const integrations = asArray(d, ast.integrations, 'integrations')
  const integrationIds = validateIntegrations(d, integrations)
  const roleIds = validateAuth(d, ast.auth)

  const actions = asArray(d, ast.actions, 'actions')
  const actionIds = new Set()
  for (const [i, a] of actions.entries()) {
    const base = `actions[${i}]`
    if (!a.id) { d.error('E2030', 'action.id is required.', { path: base }); continue }
    if (actionIds.has(a.id)) d.error('E2031', `Duplicate action id "${a.id}".`, { path: `${base}.id` })
    actionIds.add(a.id)
    if (!a.type) d.error('E2032', 'action.type is required.', { path: `${base}.type` })
    else if (!ACTION_TYPES.includes(a.type)) {
      d.error('E4003', `Unknown action type "${a.type}".`, { path: `${base}.type`, suggestion: `Supported: ${ACTION_TYPES.join(', ')}` })
    } else if (target && !target.supported_actions.includes(a.type)) {
      d.error('E4003', `Target "${targetId}" does not support action type "${a.type}".`, { path: `${base}.type` })
    }
    if (a.type && ENTITY_ACTIONS.includes(a.type) && !a.entity) {
      d.error('E2033', `Action "${a.id}" of type "${a.type}" requires entity.`, { path: `${base}.entity` })
    }
    if (a.entity && !entityIds.has(a.entity)) {
      const did = closest(a.entity, [...entityIds])
      d.error('E3001', `Action "${a.id}" references unknown entity "${a.entity}".`, {
        path: `${base}.entity`,
        suggestion: did ? `Did you mean "${did}"?` : undefined,
        fix_hint: did ? { op: 'action.update', id: a.id, entity: did } : undefined,
      })
    }
    validateAuthPolicy(d, a.auth, `${base}.auth`, roleIds)
  }

  validateWorkflows(d, asArray(d, ast.workflows, 'workflows'), actionIds, integrationIds)

  // ---- pages + sections -----------------------------------------------------
  const pages = asArray(d, ast.pages, 'pages')
  const pageIds = new Set()
  const paths = new Set()
  const ctx = { entityIds, actionIds, entities, actions }
  const detailRoutes = []
  const tableDetailRefs = []
  for (const [i, p] of pages.entries()) {
    const base = `pages[${i}]`
    if (!p.id) { d.error('E2020', 'page.id is required.', { path: base }); continue }
    if (pageIds.has(p.id)) d.error('E2021', `Duplicate page id "${p.id}".`, { path: `${base}.id` })
    pageIds.add(p.id)
    if (!p.path) {
      d.error('E2022', `page "${p.id}" is missing "path".`, { path: `${base}.path`, fix_hint: { op: 'page.set_route', id: p.id, path: '/' } })
    } else if (paths.has(p.path)) {
      d.error('E2023', `Duplicate route "${p.path}".`, { path: `${base}.path` })
    }
    if (p.path) paths.add(p.path)
    if (p.layout === 'dashboard' && !p.auth) {
      d.warn('W2001', `Dashboard page "${p.id}" (${p.path}) is public. Add auth before production.`, { path: base })
    }
    if (p.navigation != null && typeof p.navigation !== 'boolean') {
      d.error('E2024', `page "${p.id}" navigation must be boolean when provided.`, { path: `${base}.navigation` })
    }
    validateAuthPolicy(d, p.auth, `${base}.auth`, roleIds)

    for (const [j, s] of (p.sections || []).entries()) {
      const sp = `${base}.sections[${j}]`
      if (!s.id) { d.error('E2040', 'section.id is required.', { path: sp }); continue }
      if (s.type === '__missing_ref') {
        d.error('E2050', `Page "${p.id}" references missing section "${s.id}".`, {
          path: sp,
          suggestion: 'Add a section module with that id, or remove the ref from the page module.',
        })
        continue
      }
      if (!s.type) { d.error('E2041', 'section.type is required.', { path: `${sp}.type` }); continue }
      if (target && !target.supported_components.includes(s.type)) {
        const did = closest(s.type, target.supported_components)
        d.error('E4004', `Target "${targetId}" does not support component "${s.type}".`, {
          path: `${sp}.type`,
          suggestion: did ? `Did you mean "${did}"?` : `Supported: ${target.supported_components.join(', ')}`,
        })
        continue
      }
      if (s.type === 'form') validateForm(d, sp, s, ctx)
      if (s.type === 'table') validateTable(d, sp, s, ctx, { page: p, refs: tableDetailRefs })
      if (s.type === 'navbar' && ast.navigation && ast.navigation.enabled !== false) {
        d.warn('W2010', `Page "${p.id}" has a local navbar while top-level navigation is enabled.`, {
          path: sp,
          suggestion: 'Remove the local navbar section or set page.navigation: false.',
        })
      }
      if (s.type === 'content') validateContent(d, sp, s, p)
      if (s.type === 'record_detail') {
        validateRecordDetail(d, sp, s, ctx)
        if (s.entity && p.path) detailRoutes.push({ entity: s.entity, path: p.path })
      }
      if (s.type === 'custom_component') validateCustomComponent(d, sp, s, opts)
      if (s.type === 'hero' && !s.title) d.warn('W3002', `Hero "${s.id}" has no title.`, { path: `${sp}.title` })
    }
  }
  for (const ref of tableDetailRefs) {
    if (!detailRoutes.some((route) => route.entity === ref.entity && route.path === ref.path)) {
      d.error('E3010', `Table "${ref.table}" row action "detail" points to missing record_detail page "${ref.path}" for entity "${ref.entity}".`, {
        path: ref.pathRef,
        suggestion: `Add a page at ${ref.path} with a record_detail section bound to ${ref.entity}.`,
      })
    }
  }
  runPluginValidators(ast, d, opts)
  return attachProvenance(d, ast)
}

function validateDatabase(d, database) {
  if (database == null) return
  if (typeof database !== 'object' || Array.isArray(database)) {
    d.error('E2400', 'project.database must be an object.', { path: 'project.database' })
    return
  }
  if (database.driver != null && !DATABASE_DRIVER_IDS.includes(database.driver)) {
    d.error('E2401', `Unsupported database driver "${database.driver}".`, {
      path: 'project.database.driver',
      suggestion: `Supported database drivers: ${DATABASE_DRIVER_IDS.join(', ')}`,
    })
  }
}
