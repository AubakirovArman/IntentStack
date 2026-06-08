import { findNavigationItem, updateObject, clone } from '../utils.js'

export const navigationOps = {
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
    if ((ast.navigation.items || []).some((item) => item.label === op.item?.label || item.href === op.item?.href)) {
      throw new Error(`navigation item "${op.item?.label || op.item?.href}" already exists`)
    }
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
}
