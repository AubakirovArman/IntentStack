import { findSection, fieldId, updateObject, clone } from '../utils.js'

export const formOps = {
  'form.bind_entity'(ast, op) {
    const { section } = findSection(ast, op.form)
    const before = section.entity
    section.entity = op.entity
    return { summary: `bind form ${op.form} -> entity ${op.entity}`, before, after: op.entity }
  },

  'form.add'(ast, op) {
    const p = ast.pages.find((x) => x.id === op.page)
    if (!p) throw new Error(`page "${op.page}" not found`)
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
}
