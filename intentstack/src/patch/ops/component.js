import { findSection, updateObject, clone } from '../utils.js'

export const componentOps = {
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
}
