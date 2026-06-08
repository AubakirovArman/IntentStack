export const apiOps = {
  'api.route.create'(ast, op) {
    ast.api = ast.api || { routes: [] }
    ast.api.routes = ast.api.routes || []
    if (ast.api.routes.some((r) => r.id === op.id)) throw new Error(`api route "${op.id}" already exists`)
    ast.api.routes.push({ id: op.id, method: op.method, path: op.path, action: op.action })
    return { summary: `create api route ${op.id}` }
  },

  'api.bind_action'(ast, op) {
    ast.api = ast.api || { routes: [] }
    const r = (ast.api.routes || []).find((x) => x.id === op.route || x.id === op.id)
    if (!r) throw new Error(`api route "${op.route || op.id}" not found`)
    const before = r.action
    r.action = op.action
    return { summary: `bind api route ${r.id} -> ${op.action}`, before, after: r.action }
  },
}
