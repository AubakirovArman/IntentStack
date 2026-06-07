// Build the Core IR / AppGraph from parsed intent (PRD §6.2).
// This representation knows nothing about React, Hono, or Drizzle — only the domain.

import { normalize } from './normalize.js'

export function buildGraph(ast) {
  ast = normalize(ast)
  const project = ast.project || {}
  const theme = ast.theme || {}
  const entities = ast.entities || []
  const actions = ast.actions || []
  const pages = ast.pages || []
  const auth = ast.auth || null
  const navigation = ast.navigation || null
  const workflows = ast.workflows || []
  const integrations = ast.integrations || []
  const modules = ast.__intentstack ? {
    modular: ast.__intentstack.modular,
    rootPath: ast.__intentstack.rootPath,
    includes: ast.__intentstack.includes || [],
    sourceFiles: ast.__intentstack.sourceFiles || [],
    owners: ast.__intentstack.owners || {},
    pathFiles: ast.__intentstack.pathFiles || {},
  } : { modular: false, includes: [], sourceFiles: [], owners: {}, pathFiles: {} }

  const entityById = Object.fromEntries(entities.map((e) => [e.id, e]))
  const actionById = Object.fromEntries(actions.map((a) => [a.id, a]))
  const pageById = Object.fromEntries(pages.map((p) => [p.id, p]))

  return {
    version: ast.version,
    project,
    theme,
    entities,
    actions,
    pages,
    auth,
    navigation,
    workflows,
    integrations,
    modules,
    entityById,
    actionById,
    pageById,
    getEntity: (id) => entityById[id],
    getAction: (id) => actionById[id],
  }
}
