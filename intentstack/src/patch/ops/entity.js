import { findEntity, clone, updateObject, fieldId } from '../utils.js'

export const entityOps = {
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
}
