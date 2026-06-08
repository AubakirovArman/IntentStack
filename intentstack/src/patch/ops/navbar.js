import { findSection, updateObject, clone } from '../utils.js'

export const navbarOps = {
  'navbar.add'(ast, op) {
    const p = ast.pages.find((x) => x.id === op.page)
    if (!p) throw new Error(`page "${op.page}" not found`)
    p.sections = p.sections || []
    if (p.sections.some((s) => s.id === op.id)) throw new Error(`section "${op.id}" already exists on ${op.page}`)
    p.sections.unshift({ id: op.id, type: 'navbar', logo: op.logo, items: op.items || [] })
    return { summary: `add navbar ${op.id} to ${op.page}` }
  },

  'navbar.item.add'(ast, op) {
    const { section } = findSection(ast, op.navbar)
    section.items = section.items || []
    if (section.items.some((item) => item.label === op.item?.label || item.href === op.item?.href)) {
      throw new Error(`navbar item "${op.item?.label || op.item?.href}" already exists on ${op.navbar}`)
    }
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
}
