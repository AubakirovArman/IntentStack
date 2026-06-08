// Shared patch helpers used by operation handlers.
import { dirname, resolve } from 'node:path'

export const fieldId = (f) => (typeof f === 'string' ? f : (f.name || f.id))
export const colId = fieldId
export const clone = (x) => JSON.parse(JSON.stringify(x))

export function findPage(ast, id) {
  const p = (ast.pages || []).find((x) => x.id === id)
  if (!p) throw new Error(`page "${id}" not found`)
  return p
}

export function findEntity(ast, id) {
  const e = (ast.entities || []).find((x) => x.id === id)
  if (!e) throw new Error(`entity "${id}" not found`)
  return e
}

export function findAction(ast, id) {
  const a = (ast.actions || []).find((x) => x.id === id)
  if (!a) throw new Error(`action "${id}" not found`)
  return a
}

export function findSection(ast, id) {
  for (const p of ast.pages || []) {
    const s = (p.sections || []).find((x) => x.id === id)
    if (s) return { page: p, section: s }
  }
  throw new Error(`section "${id}" not found`)
}

export function findNavigationItem(ast, op) {
  const nav = ast.navigation
  if (!nav) throw new Error('navigation is not configured')
  const id = op.label || op.href
  const item = (nav.items || []).find((x) => x.label === id || x.href === id)
  if (!item) throw new Error(`navigation item "${id}" not found`)
  return item
}

export function findContentBlock(section, op) {
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
export function resolvePath(ast, path) {
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

export function cloneWithMetadata(ast) {
  const draft = clone(ast)
  if (ast?.__intentstack) defineMetadata(draft, clone(ast.__intentstack))
  return draft
}

export function commitDraft(target, draft) {
  for (const key of Object.keys(target)) delete target[key]
  for (const [key, value] of Object.entries(draft)) target[key] = value
  if (draft?.__intentstack) defineMetadata(target, clone(draft.__intentstack))
}

export function defineMetadata(target, metadata) {
  Object.defineProperty(target, '__intentstack', {
    value: metadata,
    enumerable: false,
    configurable: true,
    writable: true,
  })
}

export function updateObject(target, op, excluded = ['op', 'id']) {
  const before = clone(target)
  for (const [k, v] of Object.entries(op)) {
    if (!excluded.includes(k)) target[k] = v
  }
  return before
}

export function insertSection(page, section, op) {
  page.sections = page.sections || []
  if (page.sections.some((s) => s.id === section.id)) throw new Error(`section "${section.id}" already exists on ${page.id}`)
  let idx = page.sections.length
  if (op.after) { const i = page.sections.findIndex((s) => s.id === op.after); if (i >= 0) idx = i + 1 }
  if (op.before) { const i = page.sections.findIndex((s) => s.id === op.before); if (i >= 0) idx = i }
  if (op.index !== undefined) idx = Math.max(0, Math.min(Number(op.index), page.sections.length))
  page.sections.splice(idx, 0, section)
  return idx
}

export function insertContentBlock(section, block, op) {
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

export function cleanObject(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined))
}

export function registerSectionModule(ast, page, section, op) {
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

export function kebab(value) {
  return String(value).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'module'
}
