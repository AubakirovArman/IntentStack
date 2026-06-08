import { findSection, insertContentBlock, findContentBlock, cleanObject, kebab, clone, updateObject } from '../utils.js'

export const contentOps = {
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
}
