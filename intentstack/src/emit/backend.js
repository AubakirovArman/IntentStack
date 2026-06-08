// Backend adapter: Action nodes -> Hono routes + server entrypoint.
import { ENTITY_ACTIONS } from '../registry.js'
import { BANNER_TS } from './util.js'
import { hasActionAuth, hasPageAuth, honoAuthTs, integrationsTs, workflowsTs } from './shared/modules.js'
import { otelTs } from './shared/observability.js'
import { tenancyConfig } from './shared/tenancy.js'
import { indexTs } from './backend/indexTemplate.js'
import { routeTs } from './backend/routeTemplate.js'
import { websocketTs } from './backend/websocketTemplate.js'

export function emitBackend(graph) {
  const files = {}
  const recordActions = graph.actions.filter((a) => ENTITY_ACTIONS.includes(a.type))
  const useAuth = hasActionAuth(recordActions) || hasPageAuth(graph)
  const useWorkflows = (graph.workflows || []).length > 0
  const tenancy = tenancyConfig(graph)
  const byEntity = {}
  for (const a of recordActions) {
    if (!a.entity) continue
    ;(byEntity[a.entity] ||= []).push(a)
  }

  const imports = []
  const mounts = []
  const websocketImports = []
  const websocketMounts = []
  if (useAuth) {
    imports.push(`import { authRoutes } from './generated/auth'`)
    mounts.push(`app.route('/api', authRoutes)`)
  }
  for (const [entityId, acts] of Object.entries(byEntity)) {
    const e = graph.getEntity(entityId)
    if (!e) continue
    const fname = e.id.toLowerCase()
    files[`server/generated/routes/${fname}.ts`] = routeTs(e, acts, { useAuth, useWorkflows, tenancy })
    imports.push(`import ${fname}Routes from './generated/routes/${fname}'`)
    mounts.push(`app.route('/api', ${fname}Routes)`)
    if (acts.some((a) => a.type === 'subscribe_records')) {
      const mountName = `mount${e.id}WebSocket`
      files[`server/generated/realtime/${fname}.ts`] = websocketTs(e, { tenancy })
      websocketImports.push(`import { ${mountName} } from './generated/realtime/${fname}'`)
      websocketMounts.push(`${mountName}(server)`)
    }
  }
  if (useAuth) files['server/generated/auth.ts'] = honoAuthTs(graph, BANNER_TS)
  if (useWorkflows) files['server/generated/workflows.ts'] = workflowsTs(graph)
  if ((graph.integrations || []).length > 0) files['server/generated/integrations.ts'] = integrationsTs(graph)
  files['server/generated/otel.ts'] = otelTs(graph, BANNER_TS)
  files['server/index.ts'] = indexTs([...imports, ...websocketImports], mounts, websocketMounts)
  return files
}
