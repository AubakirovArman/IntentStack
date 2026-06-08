import { BANNER_TS } from '../util.js'

export function indexTs(imports, mounts, websocketMounts = []) {
  return BANNER_TS + `import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { randomUUID } from 'node:crypto'
import { checkDatabaseHealth, closeDatabase, migrate } from './generated/db/client'
import { exportSpan, nowNanos } from './generated/otel'
${imports.join('\n')}

const metrics = {
  started_at: new Date().toISOString(),
  requests_total: 0,
  requests_by_path: {} as Record<string, number>,
  last_request: null as null | { method: string; path: string; status: number; duration_ms: number; trace_id: string },
}
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>()
const app = new Hono()
app.use('/api/*', cors({ origin: (origin) => allowedCorsOrigin(origin), credentials: true }))
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
  c.header('traceparent', '00-' + traceId + '-' + spanId + '-01')
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
    name: c.req.method + ' ' + path,
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
app.use('/api/*', async (c, next) => {
  const path = new URL(c.req.url).pathname
  const timeoutMs = routeTimeoutMs(c.req.method, path)
  if (timeoutMs <= 0) {
    await next()
    return
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  const timeout = new Promise<Response>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true
      resolve(c.json({ error: 'route_timeout', timeout_ms: timeoutMs }, 504))
    }, timeoutMs)
  })
  const completed = next().then(() => null)
  try {
    const result = await Promise.race([completed, timeout])
    if (timedOut) return result as Response
  } finally {
    if (timer) clearTimeout(timer)
  }
})
app.use('/api/*', async (c, next) => {
  const path = new URL(c.req.url).pathname
  const limit = rateLimitConfig(c.req.method, path)
  if (limit.max <= 0 || limit.windowMs <= 0) {
    await next()
    return
  }
  const now = Date.now()
  const key = rateLimitKey(c.req.method, path, c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '')
  const bucket = rateLimitBuckets.get(key)
  const nextBucket = !bucket || bucket.resetAt <= now ? { count: 1, resetAt: now + limit.windowMs } : { count: bucket.count + 1, resetAt: bucket.resetAt }
  rateLimitBuckets.set(key, nextBucket)
  c.header('X-RateLimit-Limit', String(limit.max))
  c.header('X-RateLimit-Remaining', String(Math.max(0, limit.max - nextBucket.count)))
  c.header('X-RateLimit-Reset', String(Math.ceil(nextBucket.resetAt / 1000)))
  if (nextBucket.count > limit.max) {
    c.header('Retry-After', String(Math.ceil((nextBucket.resetAt - now) / 1000)))
    return c.json({ error: 'rate_limited', retry_after_seconds: Math.ceil((nextBucket.resetAt - now) / 1000) }, 429)
  }
  await next()
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
app.get('/api/health', async (c) => {
  try {
    await checkDatabaseHealth()
    return c.json({ ok: true, database: 'ok' })
  } catch (err) {
    return c.json({ ok: false, database: 'error', message: err instanceof Error ? err.message : String(err) }, 503)
  }
})
app.get('/api/metrics', (c) => c.json({
  ok: true,
  uptime_seconds: process.uptime(),
  ...metrics,
}))
app.post('/api/telemetry/exceptions', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  console.error(JSON.stringify({
    level: 'error',
    type: 'runtime_exception',
    message: typeof body.message === 'string' ? body.message : 'unknown',
    stack: typeof body.stack === 'string' ? body.stack : null,
    component_stack: typeof body.component_stack === 'string' ? body.component_stack : null,
    url: typeof body.url === 'string' ? body.url : null,
  }))
  return c.json({ ok: true })
})
${mounts.join('\n')}

const port = Number(process.env.PORT ?? 8787)
await migrate()
await checkDatabaseHealth()
const server = serve({ fetch: app.fetch, port })
${websocketMounts.join('\n')}
console.log('[intentstack] API listening on http://localhost:' + port)

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
    "font-src 'self' data:",
    "connect-src 'self' http://localhost:* ws://localhost:*",
    "object-src 'none'",
    "frame-src 'none'",
    "form-action 'self'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join('; ')
}

function allowedCorsOrigin(origin: string | undefined) {
  const allowed = corsOrigins()
  if (!origin) return allowed.includes('*') ? '*' : allowed[0] || ''
  if (allowed.includes('*')) return origin
  return allowed.includes(origin) ? origin : ''
}

function corsOrigins() {
  const raw = process.env.INTENTSTACK_CORS_ORIGINS || 'http://localhost:5173,http://localhost:4173'
  return raw.split(',').map((item) => item.trim()).filter(Boolean)
}

function rateLimitConfig(method: string, path: string) {
  const slug = (method + '_' + path).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')
  return {
    max: numberEnv('INTENTSTACK_RATE_LIMIT_MAX_' + slug, numberEnv('INTENTSTACK_RATE_LIMIT_MAX', 120)),
    windowMs: numberEnv('INTENTSTACK_RATE_LIMIT_WINDOW_MS_' + slug, numberEnv('INTENTSTACK_RATE_LIMIT_WINDOW_MS', 60000)),
  }
}

function routeTimeoutMs(method: string, path: string) {
  return numberEnv('INTENTSTACK_ROUTE_TIMEOUT_MS_' + routeEnvSlug(method, path), numberEnv('INTENTSTACK_ROUTE_TIMEOUT_MS', 30000))
}

function routeEnvSlug(method: string, path: string) {
  return (method + '_' + path).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function rateLimitKey(method: string, path: string, forwardedFor: string) {
  const ip = forwardedFor.split(',')[0]?.trim() || 'local'
  return [ip, method, path].join(':')
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) ? value : fallback
}

function shutdown(signal: NodeJS.Signals) {
  console.log(JSON.stringify({ level: 'info', type: 'shutdown', signal }))
  server.close((err) => {
    if (err) {
      console.error(JSON.stringify({ level: 'error', type: 'shutdown_error', message: err.message }))
      void exitAfterClose(1)
      return
    }
    void exitAfterClose(0)
  })
}

async function exitAfterClose(code: number) {
  try {
    await closeDatabase()
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', type: 'database_close_error', message: err instanceof Error ? err.message : String(err) }))
    code = 1
  }
  process.exit(code)
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
`
}
