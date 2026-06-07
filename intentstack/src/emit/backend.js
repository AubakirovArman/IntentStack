// Backend adapter: Action nodes -> Hono routes + server entrypoint.
import { BANNER_TS } from './util.js'
import { ENTITY_ACTIONS } from '../registry.js'
import { hasActionAuth, hasPageAuth, honoAuthTs, integrationsTs, isActivePolicy, roleLiteral, workflowsTs } from './shared/modules.js'
import { otelTs } from './shared/observability.js'
import { tenancyConfig } from './shared/tenancy.js'

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
  }
  if (useAuth) files['server/generated/auth.ts'] = honoAuthTs(graph, BANNER_TS)
  if (useWorkflows) files['server/generated/workflows.ts'] = workflowsTs(graph, BANNER_TS)
  if ((graph.integrations || []).length > 0) files['server/generated/integrations.ts'] = integrationsTs(graph, BANNER_TS)
  files['server/generated/otel.ts'] = otelTs(graph, BANNER_TS)
  files['server/index.ts'] = indexTs(imports, mounts)
  return files
}

function indexTs(imports, mounts) {
  return BANNER_TS + `import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { randomUUID } from 'node:crypto'
import { migrate } from './generated/db/client'
import { exportSpan, nowNanos } from './generated/otel'
${imports.join('\n')}

const metrics = {
  started_at: new Date().toISOString(),
  requests_total: 0,
  requests_by_path: {} as Record<string, number>,
  last_request: null as null | { method: string; path: string; status: number; duration_ms: number; trace_id: string },
}
const app = new Hono()
app.use('/api/*', cors({ origin: (origin) => origin || '*', credentials: true }))
app.use('/api/*', async (c, next) => {
  c.header('Content-Security-Policy', contentSecurityPolicy())
  await next()
})
app.use('/api/*', async (c, next) => {
  const requestId = c.req.header('x-request-id') || randomUUID()
  const correlationId = c.req.header('x-correlation-id') || requestId
  const traceId = traceIdFromHeader(c.req.header('traceparent')) || newTraceId()
  const spanId = newSpanId()
  const startedAt = Date.now()
  const startNanos = nowNanos()
  c.header('X-Request-Id', requestId)
  c.header('X-Correlation-Id', correlationId)
  c.header('X-Trace-Id', traceId)
  c.header('traceparent', \`00-\${traceId}-\${spanId}-01\`)
  try {
    await next()
  } finally {
    const path = new URL(c.req.url).pathname
    const duration = Date.now() - startedAt
    metrics.requests_total += 1
    metrics.requests_by_path[path] = (metrics.requests_by_path[path] || 0) + 1
    metrics.last_request = { method: c.req.method, path, status: c.res.status, duration_ms: duration, trace_id: traceId }
    console.log(JSON.stringify({
      level: 'info',
      type: 'http_request',
      request_id: requestId,
      correlation_id: correlationId,
      trace_id: traceId,
      span_id: spanId,
      method: c.req.method,
      path,
      status: c.res.status,
      duration_ms: duration,
    }))
    void exportSpan({
      name: \`\${c.req.method} \${path}\`,
      traceId,
      spanId,
      startTimeUnixNano: startNanos,
      endTimeUnixNano: nowNanos(),
      attributes: {
        'http.request.method': c.req.method,
        'url.path': path,
        'http.response.status_code': c.res.status,
        'intentstack.request_id': requestId,
        'intentstack.correlation_id': correlationId,
      },
    })
  }
})
app.onError((err, c) => {
  const requestId = c.req.header('x-request-id') || randomUUID()
  const correlationId = c.req.header('x-correlation-id') || requestId
  const traceId = traceIdFromHeader(c.req.header('traceparent')) || newTraceId()
  console.error(JSON.stringify({
    level: 'error',
    type: 'http_error',
    request_id: requestId,
    correlation_id: correlationId,
    trace_id: traceId,
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    message: err.message,
  }))
  return c.json({ error: 'internal_error', request_id: requestId, correlation_id: correlationId, trace_id: traceId }, 500)
})
app.get('/api/health', (c) => c.json({ ok: true }))
app.get('/api/metrics', (c) => c.json({
  ok: true,
  uptime_seconds: process.uptime(),
  ...metrics,
}))
${mounts.join('\n')}

const port = Number(process.env.PORT ?? 8787)
await migrate()
const server = serve({ fetch: app.fetch, port })
console.log(\`[intentstack] API listening on http://localhost:\${port}\`)

function newTraceId() {
  return randomUUID().replace(/-/g, '')
}

function newSpanId() {
  return randomUUID().replace(/-/g, '').slice(0, 16)
}

function traceIdFromHeader(value: string | undefined) {
  const match = /^00-([a-f0-9]{32})-[a-f0-9]{16}-[a-f0-9]{2}$/i.exec(value || '')
  return match?.[1]?.toLowerCase() || ''
}

function contentSecurityPolicy() {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self' http://localhost:* ws://localhost:*",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join('; ')
}

function shutdown(signal: NodeJS.Signals) {
  console.log(JSON.stringify({ level: 'info', type: 'shutdown', signal }))
  server.close((err) => {
    if (err) {
      console.error(JSON.stringify({ level: 'error', type: 'shutdown_error', message: err.message }))
      process.exit(1)
    }
    process.exit(0)
  })
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
`
}

function routeTs(entity, actions, opts) {
  const t = entity.id.toLowerCase()
  const base = entity.table || t
  const has = (type) => actions.some((a) => a.type === type)
  const action = (type) => actions.find((a) => a.type === type)
  const hasSubscribe = has('subscribe_records')
  const tenant = opts.tenancy
  const tenantWhere = tenant ? `.where(eq(${t}.tenantId, tenant))` : ''
  const idWhere = (idExpr = 'id') => tenant ? `and(eq(${t}.id, ${idExpr}), eq(${t}.tenantId, tenant))` : `eq(${t}.id, ${idExpr})`

  let out = BANNER_TS + `import { Hono } from 'hono'
${hasSubscribe ? `import { streamSSE } from 'hono/streaming'\n` : ''}import { db } from '../db/client'
import { ${t} } from '../db/schema'
import { eq, desc${tenant ? ', and' : ''} } from 'drizzle-orm'
import { ${t}CreateSchema } from '../validators/${t}'
${opts.useAuth ? `import { assertRole } from '../auth'\n` : ''}${opts.useWorkflows ? `import { runWorkflows } from '../workflows'\n` : ''}

const r = new Hono()
${tenant ? `
function readTenant(c: any) {
  const value = c.req.header(${JSON.stringify(tenant.header)}) || c.req.query('tenant_id') || ''
  return String(value).trim()
}

function tenantError(c: any) {
  return c.json({ error: 'tenant_required', header: ${JSON.stringify(tenant.header)} }, 400)
}
` : ''}
`
  if (has('list_records')) out += `
r.get('/${base}', async (c) => {
${authGuard(action('list_records'))}
${tenantGuard(tenant, 'c')}  const rows = await db.select().from(${t})${tenantWhere}.orderBy(desc(${t}.createdAt))
  return c.json({ data: rows })
})
`
  if (has('get_record')) out += `
r.get('/${base}/:id', async (c) => {
${authGuard(action('get_record'))}
${tenantGuard(tenant, 'c')}  const id = Number(c.req.param('id'))
  const rows = await db.select().from(${t}).where(${idWhere()})
  if (rows.length === 0) return c.json({ error: 'not_found' }, 404)
  return c.json({ data: rows[0] })
})
`
  if (has('create_record')) out += `
r.post('/${base}', async (c) => {
${authGuard(action('create_record'))}
${tenantGuard(tenant, 'c')}  const body = await c.req.json().catch(() => null)
  const parsed = ${t}CreateSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'validation', details: parsed.error.flatten() }, 400)
  const result = await db.insert(${t}).values({ ...parsed.data${tenant ? ', tenantId: tenant' : ''}, createdAt: new Date() }).returning()
${workflowCall(opts, action('create_record'), 'result[0]')}
  return c.json({ data: result[0] }, 201)
})
`
  if (has('update_record')) out += `
r.put('/${base}/:id', async (c) => {
${authGuard(action('update_record'))}
${tenantGuard(tenant, 'c')}  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => null)
  const parsed = ${t}CreateSchema.partial().safeParse(body)
  if (!parsed.success) return c.json({ error: 'validation', details: parsed.error.flatten() }, 400)
  const result = await db.update(${t}).set(parsed.data).where(${idWhere()}).returning()
  if (result.length === 0) return c.json({ error: 'not_found' }, 404)
${workflowCall(opts, action('update_record'), 'result[0]')}
  return c.json({ data: result[0] })
})
`
  if (has('delete_record')) out += `
r.delete('/${base}/:id', async (c) => {
${authGuard(action('delete_record'))}
${tenantGuard(tenant, 'c')}  const id = Number(c.req.param('id'))
  await db.delete(${t}).where(${idWhere()})
${workflowCall(opts, action('delete_record'), '{ id }')}
  return c.json({ ok: true })
})
`
  if (hasSubscribe) out += `
r.get('/${base}/stream', async (c) => {
${authGuard(action('subscribe_records'))}
${tenantGuard(tenant, 'c')}  return streamSSE(c, async (stream) => {
    while (true) {
      const rows = await db.select().from(${t})${tenantWhere}.orderBy(desc(${t}.createdAt))
      await stream.writeSSE({ event: 'records', data: JSON.stringify({ data: rows }) })
      await stream.sleep(2000)
    }
  })
})
`
  out += `\nexport default r\n`
  return out
}

function authGuard(action) {
  if (!action || !isActivePolicy(action.auth)) return ''
  return `  const auth = assertRole(c, ${roleLiteral(action.auth)})
  if (auth) return auth
`
}

function tenantGuard(tenant, cName) {
  if (!tenant) return ''
  return `  const tenant = readTenant(${cName})
  if (!tenant) return tenantError(${cName})
`
}

function workflowCall(opts, action, payloadExpr) {
  if (!opts.useWorkflows || !action) return ''
  return `  await runWorkflows(${JSON.stringify(action.id)}, ${payloadExpr})
`
}
