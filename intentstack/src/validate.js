// Schema + semantic validation (PRD 17 steps 3 & 6). Produces structured diagnostics
// BEFORE any code is generated.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Diagnostics, closest } from './diagnostics.js'
import { TARGETS, FIELD_TYPES, ACTION_TYPES } from './registry.js'
import { policyRoles } from './emit/shared/modules.js'

const ROOT_KEYS = new Set([
  'version',
  'project',
  'theme',
  'navigation',
  'includes',
  'auth',
  'entities',
  'actions',
  'pages',
  'workflows',
  'integrations',
])
const WORKFLOW_STEP_TYPES = ['email', 'webhook', 'background_job', 'state_transition', 'approval']
const INTEGRATION_TYPES = ['webhook', 'email', 'crm', 'telegram', 'whatsapp', 'payment', 'external_api']
const CONTENT_BLOCK_TYPES = ['heading', 'paragraph', 'list', 'code', 'link', 'callout', 'table']
const SECRET_KEY = /(secret|token|password|api[_-]?key|private[_-]?key)/i

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

  validateNavigation(d, ast.navigation)

  // ---- entities -------------------------------------------------------------
  const entities = asArray(d, ast.entities, 'entities')
  const entityIds = new Set()
  for (const [i, e] of entities.entries()) {
    const base = `entities[${i}]`
    if (!e.id) { d.error('E2010', 'entity.id is required.', { path: base }); continue }
    if (entityIds.has(e.id)) d.error('E2011', `Duplicate entity id "${e.id}".`, { path: `${base}.id` })
    entityIds.add(e.id)
    const fieldIds = new Set()
    for (const [j, f] of (e.fields || []).entries()) {
      const fp = `${base}.fields[${j}]`
      if (!f.id) { d.error('E2012', 'field.id is required.', { path: fp }); continue }
      if (fieldIds.has(f.id)) d.error('E2013', `Duplicate field "${f.id}" in entity "${e.id}".`, { path: fp })
      fieldIds.add(f.id)
      if (f.type && !FIELD_TYPES.includes(f.type)) {
        d.error('E4002', `Unsupported field type "${f.type}".`, {
          path: `${fp}.type`, suggestion: `Supported: ${FIELD_TYPES.join(', ')}`,
        })
      }
    }
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
      if (s.type === 'content') validateContent(d, sp, s)
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
  return attachProvenance(d, ast)
}

function attachProvenance(d, ast) {
  const pathFiles = ast?.__intentstack?.pathFiles
  if (!pathFiles) return d
  const entries = Object.entries(pathFiles).sort((a, b) => b[0].length - a[0].length)
  for (const item of d.items) {
    if (item.file || !item.path) continue
    const match = entries.find(([path]) => item.path === path || item.path.startsWith(`${path}.`))
    if (match) item.file = match[1]
  }
  return d
}

function validateNavigation(d, navigation) {
  if (navigation == null) return
  if (!isPlainObject(navigation)) {
    d.error('E2100', 'navigation must be an object.', { path: 'navigation' })
    return
  }
  if (navigation.enabled != null && typeof navigation.enabled !== 'boolean') {
    d.error('E2101', 'navigation.enabled must be boolean.', { path: 'navigation.enabled' })
  }
  if (navigation.logo != null && typeof navigation.logo !== 'string') {
    d.error('E2102', 'navigation.logo must be a string.', { path: 'navigation.logo' })
  }
  const items = asArray(d, navigation.items, 'navigation.items')
  const seen = new Set()
  for (const [i, item] of items.entries()) {
    const base = `navigation.items[${i}]`
    if (!isPlainObject(item)) {
      d.error('E2103', 'navigation item must be an object.', { path: base })
      continue
    }
    if (!item.label) d.error('E2104', 'navigation item label is required.', { path: `${base}.label` })
    if (!item.href) d.error('E2105', 'navigation item href is required.', { path: `${base}.href` })
    const key = item.label || item.href
    if (key && seen.has(key)) d.warn('W2101', `Duplicate navigation item "${key}".`, { path: base })
    if (key) seen.add(key)
  }
}

function asArray(d, value, path) {
  if (value == null) return []
  if (Array.isArray(value)) return value
  d.error('E2003', `"${path}" must be an array.`, { path })
  return []
}

function validateContent(d, sp, s) {
  const blocks = asArray(d, s.blocks, `${sp}.blocks`)
  if (blocks.length === 0) {
    d.warn('W3100', `Content section "${s.id}" has no blocks.`, { path: `${sp}.blocks` })
    return
  }
  const ids = new Set()
  for (const [i, block] of blocks.entries()) {
    const bp = `${sp}.blocks[${i}]`
    if (!isPlainObject(block)) {
      d.error('E2230', 'content block must be an object.', { path: bp })
      continue
    }
    if (block.id) {
      if (ids.has(block.id)) d.error('E2231', `Duplicate content block id "${block.id}".`, { path: `${bp}.id` })
      ids.add(block.id)
    }
    if (!block.type) {
      d.error('E2232', 'content block type is required.', { path: `${bp}.type` })
      continue
    }
    if (!CONTENT_BLOCK_TYPES.includes(block.type)) {
      d.error('E2233', `Unsupported content block type "${block.type}".`, {
        path: `${bp}.type`,
        suggestion: `Supported: ${CONTENT_BLOCK_TYPES.join(', ')}`,
      })
      continue
    }
    if (block.type === 'heading') {
      if (!block.text) d.error('E2234', 'heading block text is required.', { path: `${bp}.text` })
      if (block.level != null && (![2, 3, 4].includes(Number(block.level)))) {
        d.error('E2235', 'heading block level must be 2, 3, or 4.', { path: `${bp}.level` })
      }
    }
    if (block.type === 'paragraph' && !block.text) d.error('E2236', 'paragraph block text is required.', { path: `${bp}.text` })
    if (block.type === 'link') {
      if (!block.text) d.error('E2240', 'link block text is required.', { path: `${bp}.text` })
      if (!block.href) d.error('E2241', 'link block href is required.', { path: `${bp}.href` })
    }
    if (block.type === 'callout' && !block.text) d.error('E2242', 'callout block text is required.', { path: `${bp}.text` })
    if (block.type === 'list') {
      const items = asArray(d, block.items, `${bp}.items`)
      if (items.length === 0) d.error('E2237', 'list block items are required.', { path: `${bp}.items` })
      for (const [j, item] of items.entries()) {
        if (typeof item !== 'string') d.error('E2238', 'list block item must be a string.', { path: `${bp}.items[${j}]` })
      }
    }
    if (block.type === 'code' && !block.code) d.error('E2239', 'code block code is required.', { path: `${bp}.code` })
    if (block.type === 'table') {
      const columns = asArray(d, block.columns, `${bp}.columns`)
      const rows = asArray(d, block.rows, `${bp}.rows`)
      if (columns.length === 0) d.error('E2243', 'table block columns are required.', { path: `${bp}.columns` })
      if (rows.length === 0) d.error('E2244', 'table block rows are required.', { path: `${bp}.rows` })
    }
  }
}

function validateAuth(d, auth) {
  const roles = new Set(['authenticated'])
  if (auth == null || auth === false || auth === 'reserved') return roles
  if (auth === true) return roles
  if (typeof auth !== 'object' || Array.isArray(auth)) {
    d.error('E2400', 'auth must be an object, true, false, or "reserved".', { path: 'auth' })
    return roles
  }
  const roleDefs = asArray(d, auth.roles, 'auth.roles')
  const seen = new Set()
  for (const [i, role] of roleDefs.entries()) {
    const base = `auth.roles[${i}]`
    const id = typeof role === 'string' ? role : role?.id
    if (!id) {
      d.error('E2401', 'auth role id is required.', { path: base })
      continue
    }
    if (seen.has(id)) d.error('E2402', `Duplicate auth role "${id}".`, { path: base })
    seen.add(id)
    roles.add(id)
  }
  const users = asArray(d, auth.users, 'auth.users')
  const userIds = new Set()
  for (const [i, user] of users.entries()) {
    const base = `auth.users[${i}]`
    if (!user?.id) {
      d.error('E2404', 'auth user id is required.', { path: base })
      continue
    }
    if (userIds.has(user.id)) d.error('E2405', `Duplicate auth user "${user.id}".`, { path: `${base}.id` })
    userIds.add(user.id)
    const role = user.role || 'authenticated'
    if (!roles.has(role)) {
      const did = closest(role, [...roles])
      d.error('E3006', `Auth user "${user.id}" references unknown role "${role}".`, {
        path: `${base}.role`,
        suggestion: did ? `Did you mean "${did}"?` : 'Declare it under auth.roles.',
      })
    }
    if (!user.password || typeof user.password !== 'string' || !user.password.startsWith('env:')) {
      d.error('E2406', `Auth user "${user.id}" password must reference an environment variable with env:NAME.`, {
        path: `${base}.password`,
        suggestion: 'Use password: env:ADMIN_PASSWORD',
      })
    }
  }
  return roles
}

function validateAuthPolicy(d, policy, path, roleIds) {
  if (policy == null || policy === false || policy === 'reserved') return
  const roles = policyRoles(policy)
  if (roles.length === 0) {
    d.error('E2403', 'auth policy must be true, a role string, an array of roles, or { roles }.', { path })
    return
  }
  for (const role of roles) {
    if (!roleIds.has(role)) {
      const did = closest(role, [...roleIds])
      d.error('E3006', `Auth policy references unknown role "${role}".`, {
        path,
        suggestion: did ? `Did you mean "${did}"?` : 'Declare it under auth.roles.',
      })
    }
  }
}

function validateIntegrations(d, integrations) {
  const ids = new Set()
  for (const [i, integration] of integrations.entries()) {
    const base = `integrations[${i}]`
    if (!integration.id) {
      d.error('E2500', 'integration.id is required.', { path: base })
      continue
    }
    if (ids.has(integration.id)) d.error('E2501', `Duplicate integration id "${integration.id}".`, { path: `${base}.id` })
    ids.add(integration.id)
    if (!integration.type) d.error('E2502', 'integration.type is required.', { path: `${base}.type` })
    else if (!INTEGRATION_TYPES.includes(integration.type)) {
      d.error('E2503', `Unsupported integration type "${integration.type}".`, {
        path: `${base}.type`,
        suggestion: `Supported: ${INTEGRATION_TYPES.join(', ')}`,
      })
    }
    const cfg = integration.config || {}
    if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) {
      for (const key of Object.keys(cfg)) {
        if (SECRET_KEY.test(key) && typeof cfg[key] === 'string' && !cfg[key].startsWith('env:')) {
          d.error('E2504', `Integration secret "${key}" must reference an environment variable with env:NAME.`, {
            path: `${base}.config.${key}`,
            suggestion: `Use ${key}: env:${String(key).toUpperCase()}`,
          })
        }
      }
    }
  }
  return ids
}

function validateWorkflows(d, workflows, actionIds, integrationIds) {
  const ids = new Set()
  for (const [i, workflow] of workflows.entries()) {
    const base = `workflows[${i}]`
    if (!workflow.id) {
      d.error('E2600', 'workflow.id is required.', { path: base })
      continue
    }
    if (ids.has(workflow.id)) d.error('E2601', `Duplicate workflow id "${workflow.id}".`, { path: `${base}.id` })
    ids.add(workflow.id)
    const action = workflow.trigger?.action
    if (!action) {
      d.error('E2602', `Workflow "${workflow.id}" must declare trigger.action.`, { path: `${base}.trigger.action` })
    } else if (!actionIds.has(action)) {
      const did = closest(action, [...actionIds])
      d.error('E3007', `Workflow "${workflow.id}" references unknown action "${action}".`, {
        path: `${base}.trigger.action`,
        suggestion: did ? `Did you mean "${did}"?` : undefined,
      })
    }
    const steps = asArray(d, workflow.steps, `${base}.steps`)
    for (const [j, step] of steps.entries()) {
      const sp = `${base}.steps[${j}]`
      if (!step.type) d.error('E2603', 'workflow step.type is required.', { path: `${sp}.type` })
      else if (!WORKFLOW_STEP_TYPES.includes(step.type)) {
        d.error('E2604', `Unsupported workflow step type "${step.type}".`, {
          path: `${sp}.type`,
          suggestion: `Supported: ${WORKFLOW_STEP_TYPES.join(', ')}`,
        })
      }
      if (step.integration && !integrationIds.has(step.integration)) {
        const did = closest(step.integration, [...integrationIds])
        d.error('E3008', `Workflow step references unknown integration "${step.integration}".`, {
          path: `${sp}.integration`,
          suggestion: did ? `Did you mean "${did}"?` : undefined,
        })
      }
    }
  }
}

function validateCustomComponent(d, sp, s, opts) {
  if (!s.component) d.error('E2300', `Custom component "${s.id}" has no component export name.`, { path: `${sp}.component` })
  validateCustomProps(d, sp, s)
  if (!s.source) {
    d.error('E2301', `Custom component "${s.id}" has no source file.`, { path: `${sp}.source` })
    return
  }
  const outDir = opts.outDir
  if (!outDir) return
  const abs = join(outDir, s.source)
  if (!existsSync(abs)) {
    d.error('E2302', `Custom component source "${s.source}" does not exist.`, { path: `${sp}.source` })
    return
  }
  if (s.component) {
    const code = readFileSync(abs, 'utf8')
    const named = new RegExp(`export\\s+(function|const|class)\\s+${s.component}\\b`).test(code)
    const listed = new RegExp(`export\\s*\\{[^}]*\\b${s.component}\\b[^}]*\\}`).test(code)
    if (!named && !listed) {
      d.error('E2303', `Custom component source "${s.source}" does not export "${s.component}".`, { path: `${sp}.component` })
    }
  }
}

function validateCustomProps(d, sp, s) {
  if (s.props != null && (!isPlainObject(s.props) || !isJsonValue(s.props))) {
    d.error('E2304', `Custom component "${s.id}" props must be a JSON-serializable object.`, { path: `${sp}.props` })
  }
  if (s.props_schema == null) return
  if (!isPlainObject(s.props_schema)) {
    d.error('E2305', `Custom component "${s.id}" props_schema must be an object.`, { path: `${sp}.props_schema` })
    return
  }
  const props = isPlainObject(s.props) ? s.props : {}
  for (const [key, spec] of Object.entries(s.props_schema)) {
    const type = typeof spec === 'string' ? spec : spec?.type
    const required = typeof spec === 'object' && spec?.required === true
    if (!['string', 'number', 'boolean', 'object', 'array'].includes(type)) {
      d.error('E2306', `Custom component "${s.id}" prop "${key}" has unsupported schema type "${type}".`, {
        path: `${sp}.props_schema.${key}`,
        suggestion: 'Supported: string, number, boolean, object, array',
      })
      continue
    }
    if (props[key] == null) {
      if (required) d.error('E2307', `Custom component "${s.id}" missing required prop "${key}".`, { path: `${sp}.props.${key}` })
      continue
    }
    if (!matchesPropType(props[key], type)) {
      d.error('E2308', `Custom component "${s.id}" prop "${key}" must be ${type}.`, { path: `${sp}.props.${key}` })
    }
  }
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function isJsonValue(value) {
  if (value == null) return true
  if (['string', 'number', 'boolean'].includes(typeof value)) return true
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (isPlainObject(value)) return Object.values(value).every(isJsonValue)
  return false
}

function matchesPropType(value, type) {
  if (type === 'array') return Array.isArray(value)
  if (type === 'object') return isPlainObject(value)
  return typeof value === type
}

function entityFieldIds(entities, id) {
  const e = entities.find((x) => x.id === id)
  return new Set((e?.fields || []).map((f) => f.id))
}

function actionById(actions, id) {
  return (actions || []).find((a) => a.id === id)
}

function validateForm(d, sp, s, ctx) {
  if (!s.entity) {
    d.error('E2200', `Form "${s.id}" has no entity.`, { path: `${sp}.entity` })
  } else if (!ctx.entityIds.has(s.entity)) {
    const did = closest(s.entity, [...ctx.entityIds])
    d.error('E2201', `Form "${s.id}" references unknown entity "${s.entity}".`, {
      path: `${sp}.entity`,
      suggestion: did ? `Did you mean "${did}"?` : undefined,
      fix_hint: did ? { op: 'form.bind_entity', form: s.id, entity: did } : undefined,
    })
  }
  const submitAction = s.submit?.action
  if (submitAction && !ctx.actionIds.has(submitAction)) {
    const did = closest(submitAction, [...ctx.actionIds])
    d.error('E3002', `Form "${s.id}" submit references unknown action "${submitAction}".`, {
      path: `${sp}.submit.action`, suggestion: did ? `Did you mean "${did}"?` : undefined,
    })
  }
  if (!s.submit?.success_message) d.warn('W3001', `Form "${s.id}" has no success_message.`, { path: `${sp}.submit.success_message` })
  if (s.entity && ctx.entityIds.has(s.entity)) {
    const ids = entityFieldIds(ctx.entities, s.entity)
    for (const f of s.fields || []) {
      const fid = typeof f === 'string' ? f : (f.name || f.id)
      if (!ids.has(fid)) {
        d.error('E3003', `Form "${s.id}" field "${fid}" is not a field of entity "${s.entity}".`, {
          path: `${sp}.fields`, suggestion: `Available: ${[...ids].join(', ')}`,
        })
      }
    }
  }
}

function validateRecordDetail(d, sp, s, ctx) {
  if (!s.entity) {
    d.error('E2220', `Record detail "${s.id}" has no entity.`, { path: `${sp}.entity` })
  } else if (!ctx.entityIds.has(s.entity)) {
    const did = closest(s.entity, [...ctx.entityIds])
    d.error('E2221', `Record detail "${s.id}" references unknown entity "${s.entity}".`, {
      path: `${sp}.entity`, suggestion: did ? `Did you mean "${did}"?` : undefined,
    })
  }
  const src = s.source?.action
  if (!src) {
    d.error('E2222', `Record detail "${s.id}" must declare source.action.`, { path: `${sp}.source.action` })
  } else if (!ctx.actionIds.has(src)) {
    const did = closest(src, [...ctx.actionIds])
    d.error('E3005', `Record detail "${s.id}" source references unknown action "${src}".`, {
      path: `${sp}.source.action`, suggestion: did ? `Did you mean "${did}"?` : undefined,
    })
  } else {
    const a = actionById(ctx.actions, src)
    if (a?.type !== 'get_record') {
      d.error('E2223', `Record detail "${s.id}" source.action must be a get_record action.`, { path: `${sp}.source.action` })
    }
  }
  const update = s.update?.action
  if (update) {
    if (!ctx.actionIds.has(update)) {
      const did = closest(update, [...ctx.actionIds])
      d.error('E3002', `Record detail "${s.id}" update references unknown action "${update}".`, {
        path: `${sp}.update.action`, suggestion: did ? `Did you mean "${did}"?` : undefined,
      })
    } else {
      const a = actionById(ctx.actions, update)
      if (a?.type !== 'update_record') {
        d.error('E2224', `Record detail "${s.id}" update.action must be an update_record action.`, { path: `${sp}.update.action` })
      }
    }
  }
  if (s.entity && ctx.entityIds.has(s.entity)) {
    const ids = entityFieldIds(ctx.entities, s.entity)
    for (const f of s.fields || []) {
      const fid = typeof f === 'string' ? f : (f.name || f.id)
      if (!ids.has(fid)) {
        d.error('E3003', `Record detail "${s.id}" field "${fid}" is not a field of entity "${s.entity}".`, {
          path: `${sp}.fields`, suggestion: `Available: ${[...ids].join(', ')}`,
        })
      }
    }
  }
}

function validateTable(d, sp, s, ctx, opts = {}) {
  if (!s.entity) {
    d.error('E2210', `Table "${s.id}" has no entity.`, { path: `${sp}.entity` })
  } else if (!ctx.entityIds.has(s.entity)) {
    const did = closest(s.entity, [...ctx.entityIds])
    d.error('E2211', `Table "${s.id}" references unknown entity "${s.entity}".`, {
      path: `${sp}.entity`, suggestion: did ? `Did you mean "${did}"?` : undefined,
    })
  }
  const src = s.source?.action
  if (src && !ctx.actionIds.has(src)) {
    const did = closest(src, [...ctx.actionIds])
    d.error('E3005', `Table "${s.id}" source references unknown action "${src}".`, {
      path: `${sp}.source.action`, suggestion: did ? `Did you mean "${did}"?` : undefined,
    })
  }
  if (s.entity && ctx.entityIds.has(s.entity)) {
    const ids = entityFieldIds(ctx.entities, s.entity)
    for (const col of s.columns || []) {
      const cid = typeof col === 'string' ? col : col.id
      if (!ids.has(cid)) {
        d.error('E3004', `Table "${s.id}" column "${cid}" is not a field of entity "${s.entity}".`, {
          path: `${sp}.columns`, suggestion: `Available: ${[...ids].join(', ')}`,
        })
      }
    }
    for (const [i, action] of (s.row_actions || []).entries()) {
      const type = action.type || action
      const requiredAction = type === 'edit' ? 'update_record' : type === 'delete' ? 'delete_record' : null
      if (!requiredAction) {
        if (type === 'detail') {
          const target = action.target || defaultDetailPath(opts.page?.path)
          opts.refs?.push({ table: s.id, entity: s.entity, path: target, pathRef: `${sp}.row_actions[${i}]` })
          continue
        }
        d.error('E2212', `Unsupported table row action "${type}".`, { path: `${sp}.row_actions[${i}]`, suggestion: 'Supported: detail, edit, delete' })
        continue
      }
      const exists = (ctx.actions || []).some((a) => a.entity === s.entity && a.type === requiredAction)
      if (!exists) {
        d.error('E3009', `Table "${s.id}" row action "${type}" requires a ${requiredAction} action for entity "${s.entity}".`, {
          path: `${sp}.row_actions[${i}]`,
          suggestion: `Add action.create with type ${requiredAction} and entity ${s.entity}.`,
        })
      }
    }
  }
}

function defaultDetailPath(path) {
  const base = String(path || '').replace(/\/$/, '')
  return `${base || '/'}/:id`.replace('//:id', '/:id')
}
