import { pascal } from '../../emit/util.js'
import { schemaImports, schemaBody, migrationSql, migrationManifest, validatorBody, entityClientNeeds } from '../../emit/shared/datamodel.js'
import { dbDriver } from '../../emit/shared/db_driver.js'
import { hasActionAuth, hasPageAuth, integrationsTs, requestAuthTs, workflowsTs } from '../../emit/shared/modules.js'
import { otelTs } from '../../emit/shared/observability.js'
import { tenancyConfig } from '../../emit/shared/tenancy.js'
import { BANNER } from './constants.js'

export function dataLayer(graph) {
  const files = {}
  const driver = dbDriver(graph)
  files['lib/db/schema.ts'] = BANNER + schemaImports(graph) + schemaBody(graph)
  files['lib/db/client.ts'] = driver.clientTs({
    banner: BANNER,
    functionName: 'ensureMigrated',
    memoized: true,
    pathImports: `import { dirname, join } from 'node:path'`,
    migrationManifestPathExpr: `join(process.cwd(), 'migrations/manifest.json')`,
  })
  files['lib/db/migrate.ts'] = BANNER + `import { runIntentStackMigrations } from './client'

runIntentStackMigrations()
  .then(() => {
    console.log('[intentstack] migrations applied')
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
`
  files[driver.migrationFile] = migrationSql(graph)
  files[driver.manifestFile] = migrationManifest(graph)
  files['lib/otel.ts'] = otelTs(graph, BANNER)
  for (const e of graph.entities) {
    files[`lib/validators/${e.id.toLowerCase()}.ts`] = BANNER + validatorBody(e)
  }
  files['lib/api/client.ts'] = apiClientTs(graph)
  if (hasActionAuth(graph.actions) || hasPageAuth(graph)) files['lib/auth.ts'] = requestAuthTs(graph, BANNER)
  if ((graph.workflows || []).length > 0) files['lib/workflows.ts'] = workflowsTs(graph, BANNER)
  if ((graph.integrations || []).length > 0) files['lib/integrations.ts'] = integrationsTs(graph, BANNER)
  return files
}

function apiClientTs(graph) {
  const tenancy = tenancyConfig(graph)
  let out = BANNER + `function csrfToken() {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.split('; ').find((part) => part.startsWith('intentstack_csrf='))
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : ''
}

function csrfHeaders(): Record<string, string> {
  const token = csrfToken()
  return token ? { 'X-CSRF-Token': token } : {}
}

${tenancy ? `function tenantId() {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(${JSON.stringify(tenancy.storageKey)}) ?? ''
}

function tenantHeaders(): Record<string, string> {
  const tenant = tenantId()
  return tenant ? { ${JSON.stringify(tenancy.header)}: tenant } : {}
}

function tenantQuery() {
  const tenant = tenantId()
  return tenant ? '?tenant_id=' + encodeURIComponent(tenant) : ''
}

` : `function tenantHeaders(): Record<string, string> { return {} }
function tenantQuery() { return '' }

`}
`
  for (const [eid, types] of Object.entries(entityClientNeeds(graph))) {
    const e = graph.getEntity(eid)
    const base = e?.table || eid.toLowerCase()
    const P = pascal(eid)
    if (types.has('create_record')) {
      out += `export async function create${P}(payload: Record<string, unknown>) {
  const res = await fetch('/api/${base}', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...tenantHeaders(), ...csrfHeaders() },
    body: JSON.stringify(payload),
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, data: json.data, error: json.error }
}

`
    }
    if (types.has('list_records')) {
      out += `export async function list${P}(): Promise<Array<Record<string, unknown>>> {
  const res = await fetch('/api/${base}', { cache: 'no-store', credentials: 'include', headers: tenantHeaders() })
  const json = await res.json().catch(() => ({ data: [] }))
  return (json.data ?? []) as Array<Record<string, unknown>>
}

`
    }
    if (types.has('get_record')) {
      out += `export async function get${P}(id: number): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: unknown }> {
  const res = await fetch('/api/${base}/' + id, { cache: 'no-store', credentials: 'include', headers: tenantHeaders() })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, data: json.data, error: json.error }
}

`
    }
    if (types.has('update_record')) {
      out += `export async function update${P}(id: number, payload: Record<string, unknown>) {
  const res = await fetch('/api/${base}/' + id, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...tenantHeaders(), ...csrfHeaders() },
    body: JSON.stringify(payload),
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, data: json.data, error: json.error }
}

`
    }
    if (types.has('delete_record')) {
      out += `export async function delete${P}(id: number) {
  const res = await fetch('/api/${base}/' + id, { method: 'DELETE', credentials: 'include', headers: { ...tenantHeaders(), ...csrfHeaders() } })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, data: json.data, error: json.error }
}

`
    }
    if (types.has('subscribe_records')) {
      out += `export function subscribe${P}(onRecords: (rows: Array<Record<string, unknown>>) => void, onError?: (event: Event) => void) {
  const source = new EventSource(\`/api/${base}/stream\${tenantQuery()}\`, { withCredentials: true })
  source.addEventListener('records', (event) => {
    const json = JSON.parse((event as MessageEvent).data)
    onRecords((json.data ?? []) as Array<Record<string, unknown>>)
  })
  if (onError) source.addEventListener('error', onError)
  return () => source.close()
}

`
    }
  }
  return out
}
