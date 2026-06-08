import { clone } from '../utils.js'

export const projectOps = {
  'project.set_name'(ast, op) {
    ast.project = ast.project || {}
    const before = ast.project.name
    ast.project.name = op.name
    return { summary: `set project name`, before, after: op.name }
  },

  'project.set_target'(ast, op) {
    ast.project = ast.project || {}
    const before = ast.project.target
    ast.project.target = op.target
    return { summary: `set project target`, before, after: op.target }
  },

  'project.set_theme'(ast, op) {
    const before = clone(ast.theme || {})
    ast.theme = { ...(ast.theme || {}), ...(op.theme || {}) }
    for (const k of ['preset', 'radius', 'density', 'color', 'shadow']) {
      if (op[k] !== undefined) ast.theme[k] = op[k]
    }
    return { summary: `set project theme`, before, after: clone(ast.theme) }
  },
}
