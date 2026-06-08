import { insertSection, registerSectionModule, findSection, updateObject, clone } from '../utils.js'

export const sectionOps = {
  'section.add'(ast, op) {
    const p = ast.pages.find((x) => x.id === op.page)
    if (!p) throw new Error(`page "${op.page}" not found`)
    insertSection(p, op.section, op)
    return { summary: `add section ${op.section.id} (${op.section.type}) to ${op.page}` }
  },

  'section.module.add'(ast, op) {
    const p = ast.pages.find((x) => x.id === op.page)
    if (!p) throw new Error(`page "${op.page}" not found`)
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
    const p = ast.pages.find((x) => x.id === op.page)
    if (!p) throw new Error(`page "${op.page}" not found`)
    const i = (p.sections || []).findIndex((s) => s.id === op.section)
    if (i < 0) throw new Error(`section "${op.section}" not found on ${op.page}`)
    p.sections.splice(i, 1)
    return { summary: `remove section ${op.section} from ${op.page}` }
  },

  'section.move'(ast, op) {
    const p = ast.pages.find((x) => x.id === op.page)
    if (!p) throw new Error(`page "${op.page}" not found`)
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
}
