import { findPage, updateObject, clone } from '../utils.js'

export const pageOps = {
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
}
