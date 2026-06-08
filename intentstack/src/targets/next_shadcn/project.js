import { hasActionAuth, hasPageAuth, declaredUsers } from '../../emit/shared/modules.js'
import { dbDriver } from '../../emit/shared/db_driver.js'
import { BANNER, radiusVar } from './constants.js'
import { buildProjectFiles } from './project_templates.js'

export function projectFiles(graph) {
  const id = (graph.project?.id || 'app').toLowerCase().replace(/[^a-z0-9-]/g, '-')
  const name = graph.project?.name || 'IntentStack App'
  const useAuth = hasActionAuth(graph.actions) || hasPageAuth(graph)
  const driver = dbDriver(graph)

  return buildProjectFiles(graph, {
    id,
    name,
    useAuth,
    driver,
    users: declaredUsers(graph),
    radiusVar,
    banner: BANNER,
  })
}

