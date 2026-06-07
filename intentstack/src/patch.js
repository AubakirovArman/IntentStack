// Patch DSL (PRD 12-13). Apply small, semantic, validated changes to the intent AST.
// An agent's normal loop is: write a patch -> check -> build, NOT rewrite the whole intent.
import { dirname, resolve } from 'node:path'

export function applyPatch(ast, patchDoc) {
  const ops = patchDoc?.patch || patchDoc?.ops || []
  const draft = cloneWithMetadata(ast)
  const changes = []
  const errors = []
  ops.forEach((op, idx) => {
    const fn = OPS[op.op]
    if (!fn) { errors.push(`patch[${idx}]: unknown op "${op.op}"`); return }
    try {
      changes.push({ op: op.op, ...fn(draft, op) })
    } catch (e) {
      errors.push(`patch[${idx}] (${op.op}): ${e.message}`)
    }
  })
  if (errors.length === 0) commitDraft(ast, draft)
  else changes.length = 0
  return { ast, changes, errors }
}

// ---- lookups --------------------------------------------------------------
function findPage(ast, id) {
  const p = (ast.pages || []).find((x) => x.id === id)
  if (!p) throw new Error(`page "${id}" not found`)
  return p
}
function findEntity(ast, id) {
  const e = (ast.entities || []).find((x) => x.id === id)
  if (!e) throw new Error(`entity "${id}" not found`)
  return e
}
function findAction(ast, id) {
  const a = (ast.actions || []).find((x) => x.id === id)
  if (!a) throw new Error(`action "${id}" not found`)
  return a
}
function findSection(ast, id) {
  for (const p of ast.pages || []) {
    const s = (p.sections || []).find((x) => x.id === id)
    if (s) return { page: p, section: s }
  }
  throw new Error(`section "${id}" not found`)
}
function findNavigationItem(ast, op) {
  const nav = ast.navigation
  if (!nav) throw new Error('navigation is not configured')
  const id = op.label || op.href
  const item = (nav.items || []).find((x) => x.label === id || x.href === id)
  if (!item) throw new Error(`navigation item "${id}" not found`)
  return item
}
function findContentBlock(section, op) {
  if (section.type !== 'content') throw new Error(`"${section.id}" is not a content section`)
  const id = op.block || op.id
  const blocks = section.blocks || []
  if (op.index !== undefined) {
    const i = Number(op.index)
    if (!Number.isInteger(i) || i < 0 || i >= blocks.length) throw new Error(`content block index "${op.index}" not found`)
    return { block: blocks[i], index: i }
  }
  const i = blocks.findIndex((b) => b.id === id)
  if (i < 0) throw new Error(`content block "${id}" not found on ${section.id}`)
  return { block: blocks[i], index: i }
}

// semantic path: page.<id>.section.<id>.<prop>[.<prop>...] / entity.<id>.field.<id>.<prop>
function resolvePath(ast, path) {
  const parts = String(path).split('.')
  let node = ast
  let i = 0
  while (i < parts.length - 1) {
    const p = parts[i]
    if (p === 'page') { node = (node.pages || []).find((x) => x.id === parts[i + 1]); i += 2 }
    else if (p === 'section') { node = (node.sections || []).find((x) => x.id === parts[i + 1]); i += 2 }
    else if (p === 'entity') { node = (node.entities || []).find((x) => x.id === parts[i + 1]); i += 2 }
    else if (p === 'field') { node = (node.fields || []).find((x) => x.id === parts[i + 1]); i += 2 }
    else if (p === 'action') { node = (node.actions || []).find((x) => x.id === parts[i + 1]); i += 2 }
    else { if (node[p] == null) node[p] = {}; node = node[p]; i += 1 }
    if (!node) return null
  }
  return { obj: node, key: parts[parts.length - 1] }
}

const fieldId = (f) => (typeof f === 'string' ? f : (f.name || f.id))
const colId = fieldId
const clone = (x) => JSON.parse(JSON.stringify(x))

function cloneWithMetadata(ast) {
  const draft = clone(ast)
  if (ast?.__intentstack) defineMetadata(draft, clone(ast.__intentstack))
  return draft
}

function commitDraft(target, draft) {
  for (const key of Object.keys(target)) delete target[key]
  for (const [key, value] of Object.entries(draft)) target[key] = value
  if (draft?.__intentstack) defineMetadata(target, clone(draft.__intentstack))
}

function defineMetadata(target, metadata) {
  Object.defineProperty(target, '__intentstack', {
    value: metadata,
    enumerable: false,
    configurable: true,
    writable: true,
  })
}

function updateObject(target, op, excluded = ['op', 'id']) {
  const before = clone(target)
  for (const [k, v] of Object.entries(op)) {
    if (!excluded.includes(k)) target[k] = v
  }
  return before
}

function insertSection(page, section, op) {
  page.sections = page.sections || []
  if (page.sections.some((s) => s.id === section.id)) throw new Error(`section "${section.id}" already exists on ${page.id}`)
  let idx = page.sections.length
  if (op.after) { const i = page.sections.findIndex((s) => s.id === op.after); if (i >= 0) idx = i + 1 }
  if (op.before) { const i = page.sections.findIndex((s) => s.id === op.before); if (i >= 0) idx = i }
  if (op.index !== undefined) idx = Math.max(0, Math.min(Number(op.index), page.sections.length))
  page.sections.splice(idx, 0, section)
  return idx
}

function insertContentBlock(section, block, op) {
  if (section.type !== 'content') throw new Error(`"${section.id}" is not a content section`)
  if (!block || typeof block !== 'object' || Array.isArray(block)) throw new Error('content block is required')
  section.blocks = section.blocks || []
  if (block.id && section.blocks.some((b) => b.id === block.id)) throw new Error(`content block "${block.id}" already exists on ${section.id}`)
  let idx = section.blocks.length
  if (op.after) {
    const i = section.blocks.findIndex((b) => b.id === op.after)
    if (i >= 0) idx = i + 1
  }
  if (op.before) {
    const i = section.blocks.findIndex((b) => b.id === op.before)
    if (i >= 0) idx = i
  }
  if (op.index !== undefined) idx = Math.max(0, Math.min(Number(op.index), section.blocks.length))
  section.blocks.splice(idx, 0, block)
  return idx
}

function cleanObject(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined))
}

function registerSectionModule(ast, page, section, op) {
  const metadata = ast.__intentstack
  if (!metadata?.modular) throw new Error('section.module.add requires a modular intent project')
  const rootPath = metadata.rootPath
  if (!rootPath) throw new Error('section.module.add cannot resolve the root intent path')
  const file = resolve(dirname(rootPath), op.file || op.path || `frontend/sections/${kebab(page.id)}/${kebab(section.id)}.section.yaml`)
  metadata.owners = metadata.owners || {}
  metadata.owners.sections = metadata.owners.sections || {}
  metadata.owners.sections[section.id] = { file, kind: 'section', page: page.id }
  metadata.sourceFiles = metadata.sourceFiles || []
  if (!metadata.sourceFiles.includes(file)) metadata.sourceFiles.push(file)
  metadata.includes = metadata.includes || []
  if (!metadata.includes.includes('frontend/sections/**/*.yaml')) metadata.includes.push('frontend/sections/**/*.yaml')
  return file
}

function kebab(value) {
  return String(value).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'module'
}

// ---- operations -----------------------------------------------------------
const OPS = {
  'project.set_name'(ast, op) {
    ast.project = ast.project || {}
    const before = ast.project.name
    ast.project.name = op.name
    return { summary: `set project name`, before, after: op.name }
  },

  'project.set_target'(ast, op) {
    ast.project = ast.project || {}
    const before = ast.project.target
    ast.project.target = op.target
    return { summary: `set project target`, before, after: op.target }
  },

  'project.set_theme'(ast, op) {
    const before = clone(ast.theme || {})
    ast.theme = { ...(ast.theme || {}), ...(op.theme || {}) }
    for (const k of ['preset', 'radius', 'density', 'color', 'shadow']) {
      if (op[k] !== undefined) ast.theme[k] = op[k]
    }
    return { summary: `set project theme`, before, after: clone(ast.theme) }
  },

  'navigation.set'(ast, op) {
    const before = clone(ast.navigation || {})
    ast.navigation = {
      ...(ast.navigation || {}),
      ...(op.navigation || {}),
    }
    for (const k of ['enabled', 'logo', 'items']) {
      if (op[k] !== undefined) ast.navigation[k] = op[k]
    }
    if (!ast.navigation.items) ast.navigation.items = []
    return { summary: 'set global navigation', before, after: clone(ast.navigation) }
  },

  'navigation.logo.set'(ast, op) {
    ast.navigation = ast.navigation || { items: [] }
    const before = ast.navigation.logo
    ast.navigation.logo = op.logo || op.value
    return { summary: 'set global navigation logo', before, after: ast.navigation.logo }
  },

  'navigation.item.add'(ast, op) {
    ast.navigation = ast.navigation || { items: [] }
    ast.navigation.items = ast.navigation.items || []
    ast.navigation.items.push(op.item)
    return { summary: `add navigation item "${op.item.label}"` }
  },

  'navigation.item.remove'(ast, op) {
    if (!ast.navigation) throw new Error('navigation is not configured')
    const id = op.label || op.href
    const i = (ast.navigation.items || []).findIndex((item) => item.label === id || item.href === id)
    if (i < 0) throw new Error(`navigation item "${id}" not found`)
    ast.navigation.items.splice(i, 1)
    return { summary: `remove navigation item "${id}"` }
  },

  'navigation.item.update'(ast, op) {
    const item = findNavigationItem(ast, op)
    const id = op.label || op.href
    const before = op.item
      ? updateObject(item, op.item, [])
      : updateObject(item, op, ['op', 'label', 'href', 'item'])
    return { summary: `update navigation item "${id}"`, before, after: clone(item) }
  },

  'text.set'(ast, op) {
    const r = resolvePath(ast, op.target)
    if (!r || !r.obj) throw new Error(`cannot resolve target "${op.target}"`)
    const before = r.obj[r.key]
    r.obj[r.key] = op.value
    return { summary: `set ${op.target}`, before, after: op.value }
  },

  'text.append'(ast, op) {
    const r = resolvePath(ast, op.target)
    if (!r || !r.obj) throw new Error(`cannot resolve target "${op.target}"`)
    const before = r.obj[r.key] ?? ''
    r.obj[r.key] = String(before) + String(op.value ?? '')
    return { summary: `append ${op.target}`, before, after: r.obj[r.key] }
  },

  'text.replace'(ast, op) {
    const r = resolvePath(ast, op.target)
    if (!r || !r.obj) throw new Error(`cannot resolve target "${op.target}"`)
    const before = r.obj[r.key] ?? ''
    r.obj[r.key] = String(before).replace(String(op.search ?? ''), String(op.value ?? ''))
    return { summary: `replace ${op.target}`, before, after: r.obj[r.key] }
  },

  'text.clear'(ast, op) {
    const r = resolvePath(ast, op.target)
    if (!r || !r.obj) throw new Error(`cannot resolve target "${op.target}"`)
    const before = r.obj[r.key]
    r.obj[r.key] = ''
    return { summary: `clear ${op.target}`, before, after: '' }
  },

  'entity.create'(ast, op) {
    ast.entities = ast.entities || []
    if (ast.entities.some((e) => e.id === op.id)) throw new Error(`entity "${op.id}" already exists`)
    ast.entities.push({ id: op.id, table: op.table || op.id.toLowerCase(), fields: op.fields || [] })
    return { summary: `create entity ${op.id}` }
  },

  'entity.delete'(ast, op) {
    const i = (ast.entities || []).findIndex((e) => e.id === op.id)
    if (i < 0) throw new Error(`entity "${op.id}" not found`)
    ast.entities.splice(i, 1)
    return { summary: `delete entity ${op.id}` }
  },

  'entity.field.add'(ast, op) {
    const e = findEntity(ast, op.entity)
    e.fields = e.fields || []
    if (e.fields.some((f) => f.id === op.field.id)) throw new Error(`field "${op.field.id}" already exists on ${op.entity}`)
    e.fields.push(op.field)
    return { summary: `add field ${op.entity}.${op.field.id} (${op.field.type || 'string'})` }
  },

  'entity.field.update'(ast, op) {
    const e = findEntity(ast, op.entity)
    const f = (e.fields || []).find((x) => x.id === op.field || x.id === op.id)
    if (!f) throw new Error(`field "${op.field || op.id}" not found on ${op.entity}`)
    const before = updateObject(f, op, ['op', 'entity', 'field', 'id'])
    return { summary: `update field ${op.entity}.${f.id}`, before, after: clone(f) }
  },

  'entity.field.remove'(ast, op) {
    const e = findEntity(ast, op.entity)
    const id = op.field || op.id
    const i = (e.fields || []).findIndex((f) => f.id === id)
    if (i < 0) throw new Error(`field "${id}" not found on ${op.entity}`)
    e.fields.splice(i, 1)
    return { summary: `remove field ${op.entity}.${id}` }
  },

  'action.create'(ast, op) {
    ast.actions = ast.actions || []
    if (ast.actions.some((a) => a.id === op.id)) throw new Error(`action "${op.id}" already exists`)
    ast.actions.push({ id: op.id, type: op.type, entity: op.entity })
    return { summary: `create action ${op.id} (${op.type} ${op.entity || ''})` }
  },

  'action.update'(ast, op) {
    const a = findAction(ast, op.id)
    const before = updateObject(a, op, ['op', 'id'])
    return { summary: `update action ${op.id}`, before, after: clone(a) }
  },

  'action.delete'(ast, op) {
    const i = (ast.actions || []).findIndex((a) => a.id === op.id)
    if (i < 0) throw new Error(`action "${op.id}" not found`)
    ast.actions.splice(i, 1)
    return { summary: `delete action ${op.id}` }
  },

  'action.bind'(ast, op) {
    const a = findAction(ast, op.action || op.id)
    const before = clone(a)
    if (op.entity !== undefined) a.entity = op.entity
    if (op.target !== undefined) a.target = op.target
    return { summary: `bind action ${a.id}`, before, after: clone(a) }
  },

  'form.bind_entity'(ast, op) {
    const { section } = findSection(ast, op.form)
    const before = section.entity
    section.entity = op.entity
    return { summary: `bind form ${op.form} -> entity ${op.entity}`, before, after: op.entity }
  },

  'form.add'(ast, op) {
    const p = findPage(ast, op.page)
    p.sections = p.sections || []
    if (p.sections.some((s) => s.id === op.id)) throw new Error(`section "${op.id}" already exists on ${op.page}`)
    p.sections.push({
      id: op.id,
      type: 'form',
      title: op.title,
      entity: op.entity,
      fields: op.fields || [],
      submit: op.submit || (op.action ? { action: op.action } : undefined),
    })
    return { summary: `add form ${op.id} to ${op.page}` }
  },

  'form.field.add'(ast, op) {
    const { section } = findSection(ast, op.form)
    if (section.type !== 'form') throw new Error(`"${op.form}" is not a form`)
    section.fields = section.fields || []
    const fid = fieldId(op.field)
    if (section.fields.some((f) => fieldId(f) === fid)) throw new Error(`form ${op.form} already has field "${fid}"`)
    section.fields.push(op.field)
    return { summary: `add field "${fid}" to form ${op.form}` }
  },

  'form.field.remove'(ast, op) {
    const { section } = findSection(ast, op.form)
    if (section.type !== 'form') throw new Error(`"${op.form}" is not a form`)
    const id = op.field || op.id
    const i = (section.fields || []).findIndex((f) => fieldId(f) === id)
    if (i < 0) throw new Error(`form ${op.form} field "${id}" not found`)
    section.fields.splice(i, 1)
    return { summary: `remove field "${id}" from form ${op.form}` }
  },

  'form.field.update'(ast, op) {
    const { section } = findSection(ast, op.form)
    if (section.type !== 'form') throw new Error(`"${op.form}" is not a form`)
    const id = op.field || op.id
    const i = (section.fields || []).findIndex((f) => fieldId(f) === id)
    if (i < 0) throw new Error(`form ${op.form} field "${id}" not found`)
    const before = clone(section.fields[i])
    section.fields[i] = typeof section.fields[i] === 'string'
      ? { id, ...op.value }
      : { ...section.fields[i], ...op.value }
    return { summary: `update field "${id}" on form ${op.form}`, before, after: clone(section.fields[i]) }
  },

  'form.bind_submit'(ast, op) {
    const { section } = findSection(ast, op.form)
    if (section.type !== 'form') throw new Error(`"${op.form}" is not a form`)
    const before = clone(section.submit || {})
    section.submit = { ...(section.submit || {}), action: op.action }
    return { summary: `bind form ${op.form} submit -> ${op.action}`, before, after: clone(section.submit) }
  },

  'form.set_success_message'(ast, op) {
    const { section } = findSection(ast, op.form)
    if (section.type !== 'form') throw new Error(`"${op.form}" is not a form`)
    const before = section.submit?.success_message
    section.submit = { ...(section.submit || {}), success_message: op.message || op.value }
    return { summary: `set form ${op.form} success message`, before, after: section.submit.success_message }
  },

  'table.add'(ast, op) {
    const p = findPage(ast, op.page)
    p.sections = p.sections || []
    if (p.sections.some((s) => s.id === op.id)) throw new Error(`section "${op.id}" already exists on ${op.page}`)
    p.sections.push({
      id: op.id,
      type: 'table',
      entity: op.entity,
      source: op.source || (op.action ? { action: op.action } : undefined),
      columns: op.columns || [],
    })
    return { summary: `add table ${op.id} to ${op.page}` }
  },

  'table.column.add'(ast, op) {
    const { section } = findSection(ast, op.table)
    if (section.type !== 'table') throw new Error(`"${op.table}" is not a table`)
    section.columns = section.columns || []
    const cid = colId(op.column)
    if (section.columns.some((c) => fieldId(c) === cid)) throw new Error(`table ${op.table} already has column "${cid}"`)
    section.columns.push(op.column)
    return { summary: `add column "${cid}" to table ${op.table}` }
  },

  'table.column.remove'(ast, op) {
    const { section } = findSection(ast, op.table)
    if (section.type !== 'table') throw new Error(`"${op.table}" is not a table`)
    const id = op.column || op.id
    const i = (section.columns || []).findIndex((c) => colId(c) === id)
    if (i < 0) throw new Error(`table ${op.table} column "${id}" not found`)
    section.columns.splice(i, 1)
    return { summary: `remove column "${id}" from table ${op.table}` }
  },

  'table.column.update'(ast, op) {
    const { section } = findSection(ast, op.table)
    if (section.type !== 'table') throw new Error(`"${op.table}" is not a table`)
    const id = op.column || op.id
    const i = (section.columns || []).findIndex((c) => colId(c) === id)
    if (i < 0) throw new Error(`table ${op.table} column "${id}" not found`)
    const before = clone(section.columns[i])
    section.columns[i] = typeof section.columns[i] === 'string'
      ? { id, ...op.value }
      : { ...section.columns[i], ...op.value }
    return { summary: `update column "${id}" on table ${op.table}`, before, after: clone(section.columns[i]) }
  },

  'table.bind_source'(ast, op) {
    const { section } = findSection(ast, op.table)
    if (section.type !== 'table') throw new Error(`"${op.table}" is not a table`)
    const before = clone(section.source || {})
    section.source = { ...(section.source || {}), action: op.action }
    return { summary: `bind table ${op.table} source -> ${op.action}`, before, after: clone(section.source) }
  },

  'section.add'(ast, op) {
    const p = findPage(ast, op.page)
    insertSection(p, op.section, op)
    return { summary: `add section ${op.section.id} (${op.section.type}) to ${op.page}` }
  },

  'section.module.add'(ast, op) {
    const p = findPage(ast, op.page)
    const section = op.section || {
      id: op.id,
      type: op.type,
      title: op.title,
      items: op.items,
      blocks: op.blocks,
    }
    if (!section?.id) throw new Error('section.module.add requires section.id or id')
    if (!section.type) throw new Error('section.module.add requires section.type or type')
    insertSection(p, section, op)
    const file = registerSectionModule(ast, p, section, op)
    return { summary: `add section module ${section.id} (${section.type}) to ${op.page}`, file }
  },

  'section.update'(ast, op) {
    const { section } = findSection(ast, op.section || op.id)
    const before = updateObject(section, op, ['op', 'section', 'id'])
    return { summary: `update section ${section.id}`, before, after: clone(section) }
  },

  'section.remove'(ast, op) {
    const p = findPage(ast, op.page)
    const i = (p.sections || []).findIndex((s) => s.id === op.section)
    if (i < 0) throw new Error(`section "${op.section}" not found on ${op.page}`)
    p.sections.splice(i, 1)
    return { summary: `remove section ${op.section} from ${op.page}` }
  },

  'section.move'(ast, op) {
    const p = findPage(ast, op.page)
    const sections = p.sections || []
    const i = sections.findIndex((s) => s.id === op.section)
    if (i < 0) throw new Error(`section "${op.section}" not found on ${op.page}`)
    const [section] = sections.splice(i, 1)
    let idx = sections.length
    if (op.after) { const j = sections.findIndex((s) => s.id === op.after); if (j >= 0) idx = j + 1 }
    if (op.before) { const j = sections.findIndex((s) => s.id === op.before); if (j >= 0) idx = j }
    if (op.index !== undefined) idx = Math.max(0, Math.min(Number(op.index), sections.length))
    sections.splice(idx, 0, section)
    return { summary: `move section ${op.section} on ${op.page}` }
  },

  'navbar.add'(ast, op) {
    const p = findPage(ast, op.page)
    p.sections = p.sections || []
    if (p.sections.some((s) => s.id === op.id)) throw new Error(`section "${op.id}" already exists on ${op.page}`)
    p.sections.unshift({ id: op.id, type: 'navbar', logo: op.logo, items: op.items || [] })
    return { summary: `add navbar ${op.id} to ${op.page}` }
  },

  'navbar.item.add'(ast, op) {
    const { section } = findSection(ast, op.navbar)
    section.items = section.items || []
    section.items.push(op.item)
    return { summary: `add navbar item "${op.item.label}" to ${op.navbar}` }
  },

  'navbar.item.remove'(ast, op) {
    const { section } = findSection(ast, op.navbar)
    const id = op.label || op.href
    const i = (section.items || []).findIndex((item) => item.label === id || item.href === id)
    if (i < 0) throw new Error(`navbar item "${id}" not found on ${op.navbar}`)
    section.items.splice(i, 1)
    return { summary: `remove navbar item "${id}" from ${op.navbar}` }
  },

  'navbar.item.update'(ast, op) {
    const { section } = findSection(ast, op.navbar)
    const id = op.label || op.href
    const item = (section.items || []).find((x) => x.label === id || x.href === id)
    if (!item) throw new Error(`navbar item "${id}" not found on ${op.navbar}`)
    const before = op.item
      ? updateObject(item, op.item, [])
      : updateObject(item, op, ['op', 'navbar', 'label', 'href', 'item'])
    return { summary: `update navbar item "${id}" on ${op.navbar}`, before, after: clone(item) }
  },

  'navbar.logo.set'(ast, op) {
    const { section } = findSection(ast, op.navbar)
    const before = section.logo
    section.logo = op.logo || op.value
    return { summary: `set navbar ${op.navbar} logo`, before, after: section.logo }
  },

  'page.create'(ast, op) {
    ast.pages = ast.pages || []
    if (ast.pages.some((p) => p.id === op.id)) throw new Error(`page "${op.id}" already exists`)
    ast.pages.push({ id: op.id, path: op.path, layout: op.layout || 'landing', sections: op.sections || [] })
    return { summary: `create page ${op.id} (${op.path})` }
  },

  'page.update'(ast, op) {
    const p = findPage(ast, op.id)
    const before = updateObject(p, op, ['op', 'id'])
    return { summary: `update page ${op.id}`, before, after: clone(p) }
  },

  'page.delete'(ast, op) {
    const i = (ast.pages || []).findIndex((p) => p.id === op.id)
    if (i < 0) throw new Error(`page "${op.id}" not found`)
    ast.pages.splice(i, 1)
    return { summary: `delete page ${op.id}` }
  },

  'page.set_layout'(ast, op) {
    const p = findPage(ast, op.page || op.id)
    const before = p.layout
    p.layout = op.layout
    return { summary: `set page ${p.id} layout`, before, after: p.layout }
  },

  'page.set_route'(ast, op) {
    const p = findPage(ast, op.page || op.id)
    const before = p.path
    p.path = op.path
    return { summary: `set page ${p.id} route`, before, after: p.path }
  },

  'layout.set'(ast, op) {
    const p = findPage(ast, op.page)
    const before = clone(p.layout_config || {})
    p.layout_config = { ...(p.layout_config || {}), ...(op.layout || op.value || {}) }
    return { summary: `set layout config on ${op.page}`, before, after: clone(p.layout_config) }
  },

  'component.add'(ast, op) {
    const { section } = findSection(ast, op.section)
    section.components = section.components || []
    if (section.components.some((c) => c.id === op.component.id)) throw new Error(`component "${op.component.id}" already exists on ${op.section}`)
    section.components.push(op.component)
    return { summary: `add component ${op.component.id} to ${op.section}` }
  },

  'component.update'(ast, op) {
    const { section } = findSection(ast, op.section)
    const c = (section.components || []).find((x) => x.id === op.component || x.id === op.id)
    if (!c) throw new Error(`component "${op.component || op.id}" not found on ${op.section}`)
    const before = updateObject(c, op.value || op, ['op', 'section', 'component', 'id'])
    return { summary: `update component ${c.id} on ${op.section}`, before, after: clone(c) }
  },

  'component.remove'(ast, op) {
    const { section } = findSection(ast, op.section)
    const id = op.component || op.id
    const i = (section.components || []).findIndex((c) => c.id === id)
    if (i < 0) throw new Error(`component "${id}" not found on ${op.section}`)
    section.components.splice(i, 1)
    return { summary: `remove component ${id} from ${op.section}` }
  },

  'content.block.add'(ast, op) {
    const { section } = findSection(ast, op.section)
    const idx = insertContentBlock(section, op.block, op)
    return { summary: `add content block ${op.block?.id || op.block?.type || idx} to ${op.section}` }
  },

  'content.example.add'(ast, op) {
    const { section } = findSection(ast, op.section)
    const source = op.block || {}
    const previewSection = op.preview_section || op.example_section || op.target_section || source.section
    const code = op.code ?? source.code
    if (!previewSection) throw new Error('content.example.add requires preview_section')
    if (!code) throw new Error('content.example.add requires code')
    const block = cleanObject({
      id: op.id ?? source.id ?? `${kebab(previewSection)}-example`,
      type: 'example',
      title: op.title ?? source.title,
      text: op.text ?? source.text,
      section: previewSection,
      language: op.language ?? source.language ?? 'yaml',
      code,
    })
    insertContentBlock(section, block, op)
    return { summary: `add content example ${block.id || previewSection} to ${op.section}`, after: clone(block) }
  },

  'content.blocks.set'(ast, op) {
    const { section } = findSection(ast, op.section)
    if (section.type !== 'content') throw new Error(`"${op.section}" is not a content section`)
    const before = clone(section.blocks || [])
    section.blocks = clone(op.blocks || [])
    return { summary: `set content blocks on ${op.section}`, before, after: clone(section.blocks) }
  },

  'content.block.update'(ast, op) {
    const { section } = findSection(ast, op.section)
    const { block } = findContentBlock(section, op)
    const before = updateObject(block, op.value || op, ['op', 'section', 'block', 'id', 'index'])
    return { summary: `update content block ${block.id || op.index} on ${op.section}`, before, after: clone(block) }
  },

  'content.block.move'(ast, op) {
    const { section } = findSection(ast, op.section)
    if (section.type !== 'content') throw new Error(`"${op.section}" is not a content section`)
    const { block, index } = findContentBlock(section, op)
    section.blocks.splice(index, 1)
    let idx = section.blocks.length
    if (op.after) {
      const i = section.blocks.findIndex((item) => item.id === op.after)
      if (i >= 0) idx = i + 1
    }
    if (op.before) {
      const i = section.blocks.findIndex((item) => item.id === op.before)
      if (i >= 0) idx = i
    }
    if (op.to !== undefined) idx = Math.max(0, Math.min(Number(op.to), section.blocks.length))
    section.blocks.splice(idx, 0, block)
    return { summary: `move content block ${block.id || op.block || index} on ${op.section}` }
  },

  'content.block.remove'(ast, op) {
    const { section } = findSection(ast, op.section)
    const { block, index } = findContentBlock(section, op)
    section.blocks.splice(index, 1)
    return { summary: `remove content block ${block.id || index} from ${op.section}` }
  },

  'api.route.create'(ast, op) {
    ast.api = ast.api || { routes: [] }
    ast.api.routes = ast.api.routes || []
    if (ast.api.routes.some((r) => r.id === op.id)) throw new Error(`api route "${op.id}" already exists`)
    ast.api.routes.push({ id: op.id, method: op.method, path: op.path, action: op.action })
    return { summary: `create api route ${op.id}` }
  },

  'api.bind_action'(ast, op) {
    ast.api = ast.api || { routes: [] }
    const r = (ast.api.routes || []).find((x) => x.id === op.route || x.id === op.id)
    if (!r) throw new Error(`api route "${op.route || op.id}" not found`)
    const before = r.action
    r.action = op.action
    return { summary: `bind api route ${r.id} -> ${op.action}`, before, after: r.action }
  },
}

export function patchOps() {
  return Object.keys(OPS).sort()
}
