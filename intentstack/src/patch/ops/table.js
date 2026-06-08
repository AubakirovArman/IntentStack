import { findSection, clone, colId } from '../utils.js'

export const tableOps = {
  'table.add'(ast, op) {
    const p = ast.pages.find((x) => x.id === op.page)
    if (!p) throw new Error(`page "${op.page}" not found`)
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
    if (section.columns.some((c) => colId(c) === cid)) throw new Error(`table ${op.table} already has column "${cid}"`)
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
}
