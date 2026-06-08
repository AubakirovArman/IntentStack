import { asArray, INTEGRATION_TYPES, SECRET_KEY } from './utils.js'

export function validateIntegrations(d, integrations) {
  const ids = new Set()
  const list = asArray(d, integrations, 'integrations')
  for (const [i, integration] of list.entries()) {
    const base = `integrations[${i}]`
    if (!integration.id) {
      d.error('E2500', 'integration.id is required.', { path: base })
      continue
    }
    if (ids.has(integration.id)) d.error('E2501', `Duplicate integration id "${integration.id}".`, { path: `${base}.id` })
    ids.add(integration.id)
    if (!integration.type) d.error('E2502', 'integration.type is required.', { path: `${base}.type` })
    else if (!INTEGRATION_TYPES.includes(integration.type)) {
      d.error('E2503', `Unsupported integration type "${integration.type}".`, {
        path: `${base}.type`,
        suggestion: `Supported: ${INTEGRATION_TYPES.join(', ')}`,
      })
    }
    const cfg = integration.config || {}
    if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) {
      for (const key of Object.keys(cfg)) {
        if (SECRET_KEY.test(key) && typeof cfg[key] === 'string' && !cfg[key].startsWith('env:')) {
          d.error('E2504', `Integration secret "${key}" must reference an environment variable with env:NAME.`, {
            path: `${base}.config.${key}`,
            suggestion: `Use ${key}: env:${String(key).toUpperCase()}`,
          })
        }
      }
    }
  }
  return ids
}
