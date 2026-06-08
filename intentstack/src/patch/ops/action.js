import { findAction, clone, updateObject } from '../utils.js'

export const actionOps = {
  'action.create'(ast, op) {
    ast.actions = ast.actions || []
    if (ast.actions.some((a) => a.id === op.id)) throw new Error(`action "${op.id}" already exists`)
    ast.actions.push({ id: op.id, type: op.type, entity: op.entity })
    return { summary: `create action ${op.id} (${op.type} ${op.entity || ''})` }
  },

  'action.update'(ast, op) {
    const a = findAction(ast, op.id)
    const before = updateObject(a, op, ['op', 'id'])
    return { summary: `update action ${op.id}`, before, after: clone(a) }
  },

  'action.delete'(ast, op) {
    const i = (ast.actions || []).findIndex((a) => a.id === op.id)
    if (i < 0) throw new Error(`action "${op.id}" not found`)
    ast.actions.splice(i, 1)
    return { summary: `delete action ${op.id}` }
  },

  'action.bind'(ast, op) {
    const a = findAction(ast, op.action || op.id)
    const before = clone(a)
    if (op.entity !== undefined) a.entity = op.entity
    if (op.target !== undefined) a.target = op.target
    return { summary: `bind action ${a.id}`, before, after: clone(a) }
  },
}
