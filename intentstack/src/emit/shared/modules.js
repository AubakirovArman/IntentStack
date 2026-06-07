// Shared codegen helpers for roadmap domain modules. These helpers keep auth,
// workflows and integrations declarative: intent becomes metadata and guarded
// dispatch points, never arbitrary generated JavaScript from user strings.

const js = (value) => JSON.stringify(value)

export function policyRoles(policy) {
  if (!policy || policy === 'reserved') return []
  if (policy === true) return ['authenticated']
  if (typeof policy === 'string') return [policy]
  if (Array.isArray(policy)) return policy.filter((r) => typeof r === 'string')
  if (Array.isArray(policy.roles)) return policy.roles.filter((r) => typeof r === 'string')
  if (typeof policy.role === 'string') return [policy.role]
  return []
}

export function isActivePolicy(policy) {
  return policyRoles(policy).length > 0
}

export function roleLiteral(policy) {
  return js(policyRoles(policy))
}

export function hasPageAuth(graph) {
  return (graph.pages || []).some((p) => isActivePolicy(p.auth))
}

export function hasActionAuth(actions) {
  return (actions || []).some((a) => isActivePolicy(a.auth))
}

export function declaredRoles(graph) {
  const roles = new Set(['authenticated'])
  const auth = graph.auth
  if (auth && typeof auth === 'object') {
    for (const role of auth.roles || []) {
      if (typeof role === 'string') roles.add(role)
      else if (role?.id) roles.add(role.id)
      else if (role?.name) roles.add(role.name)
    }
  }
  return [...roles]
}

export function declaredUsers(graph) {
  const auth = graph.auth
  if (!auth || typeof auth !== 'object') return []
  return (auth.users || []).map((user) => ({
    id: user.id,
    role: user.role || 'authenticated',
    password: user.password,
  }))
}

export function reactAuthTs(graph, banner) {
  return banner + `'use client'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export const AUTH_ROLES = ${js(declaredRoles(graph))} as const

type AuthState = {
  loading: boolean
  authenticated: boolean
  role: string
}

function isAllowed(role: string, allowed: readonly string[]) {
  if (allowed.includes('authenticated')) return role.length > 0
  return allowed.includes(role)
}

async function loadAuth(): Promise<AuthState> {
  const res = await fetch('/api/auth/me', { credentials: 'include' }).catch(() => null)
  if (!res?.ok) return { loading: false, authenticated: false, role: '' }
  const json = await res.json().catch(() => ({}))
  return {
    loading: false,
    authenticated: Boolean(json.authenticated),
    role: typeof json.role === 'string' ? json.role : '',
  }
}

export function ProtectedPage({ roles, children }: { roles: readonly string[]; children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ loading: true, authenticated: false, role: '' })
  useEffect(() => {
    let cancelled = false
    loadAuth().then((next) => { if (!cancelled) setAuth(next) })
    return () => { cancelled = true }
  }, [])
  if (auth.loading) {
    return (
      <main className="min-h-screen bg-white p-8 text-slate-950">
        <div className="mx-auto max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold">Checking access</h1>
          <p className="mt-2 text-slate-600">Verifying your server session.</p>
        </div>
      </main>
    )
  }
  if (roles.length === 0 || isAllowed(auth.role, roles)) return <>{children}</>
  return (
    <main className="min-h-screen bg-white p-8 text-slate-950">
      <div className="mx-auto max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Access required</h1>
        <p className="mt-2 text-slate-600">This page requires one of these roles: {roles.join(', ')}.</p>
      </div>
    </main>
  )
}
`
}

export function honoAuthTs(graph, banner) {
  return banner + `import { Hono } from 'hono'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import bcrypt from 'bcryptjs'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const AUTH_ROLES = ${js(declaredRoles(graph))} as const
export const AUTH_USERS = ${js(declaredUsers(graph))} as const
const SESSION_COOKIE = 'intentstack_session'
const CSRF_COOKIE = 'intentstack_csrf'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

type SessionClaims = {
  sub: string | null
  role: string
  exp: number
  csrf: string
}

type SessionAuth = {
  session: SessionClaims
  transport: 'cookie' | 'bearer'
}

function isAllowed(role: string, allowed: readonly string[]) {
  if (allowed.includes('authenticated')) return role.length > 0
  return allowed.includes(role)
}

function jsonError(error: string, status: number) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function assertHttps(req: Request) {
  if (process.env.NODE_ENV !== 'production') return null
  const proto = req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.replace(':', '')
  return proto === 'https' ? null : jsonError('https_required', 426)
}

function sessionTtlSeconds() {
  const n = Number(process.env.INTENTSTACK_SESSION_TTL_SECONDS ?? 60 * 60 * 8)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 60 * 60 * 8
}

function sessionSecret() {
  const secret = process.env.INTENTSTACK_SESSION_SECRET
  if (secret && secret.length >= 32) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('INTENTSTACK_SESSION_SECRET must be set to at least 32 characters in production')
  }
  return 'intentstack-dev-session-secret-change-me'
}

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString('base64url')
}

function hmac(value: string) {
  return createHmac('sha256', sessionSecret()).update(value).digest('base64url')
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

function signSession(claims: SessionClaims) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify(claims))
  const data = \`\${header}.\${payload}\`
  return \`\${data}.\${hmac(data)}\`
}

function parseSession(token: string | undefined | null): SessionClaims | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const data = \`\${parts[0]}.\${parts[1]}\`
  if (!safeEqual(parts[2], hmac(data))) return null
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as SessionClaims
    if (!claims || typeof claims.role !== 'string' || typeof claims.exp !== 'number' || typeof claims.csrf !== 'string') return null
    if (claims.exp <= Math.floor(Date.now() / 1000)) return null
    return claims
  } catch {
    return null
  }
}

function issueSession(role: string, user: string | null) {
  const csrf = randomBytes(32).toString('base64url')
  const maxAge = sessionTtlSeconds()
  const token = signSession({
    sub: user,
    role,
    csrf,
    exp: Math.floor(Date.now() / 1000) + maxAge,
  })
  return { token, csrf, maxAge }
}

function readSession(c: Context): SessionAuth | null {
  const cookieToken = getCookie(c, SESSION_COOKIE)
  const cookieSession = parseSession(cookieToken)
  if (cookieSession) return { session: cookieSession, transport: 'cookie' }
  const bearer = c.req.header('authorization')?.match(/^Bearer\\s+(.+)$/i)?.[1]
  const bearerSession = parseSession(bearer)
  return bearerSession ? { session: bearerSession, transport: 'bearer' } : null
}

function assertCsrf(c: Context, auth: SessionAuth) {
  if (auth.transport !== 'cookie' || SAFE_METHODS.has(c.req.method)) return null
  const cookie = getCookie(c, CSRF_COOKIE) ?? ''
  const header = c.req.header('x-csrf-token') ?? ''
  if (cookie && header && safeEqual(cookie, header) && safeEqual(auth.session.csrf, header)) return null
  return c.json({ error: 'csrf_token_invalid' }, 403)
}

function cookieSecure(c: Context) {
  return process.env.NODE_ENV === 'production' || c.req.header('x-forwarded-proto') === 'https'
}

function setSessionCookies(c: Context, token: string, csrf: string, maxAge: number) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: cookieSecure(c),
    path: '/',
    maxAge,
  })
  setCookie(c, CSRF_COOKIE, csrf, {
    httpOnly: false,
    sameSite: 'Lax',
    secure: cookieSecure(c),
    path: '/',
    maxAge,
  })
}

function clearSessionCookies(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  deleteCookie(c, CSRF_COOKIE, { path: '/' })
}

function envRef(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('env:')) return null
  return process.env[value.slice(4)] ?? null
}

function isBcryptHash(value: string) {
  return /^\\$2[aby]\\$\\d{2}\\$/.test(value)
}

async function verifyPassword(password: string, expectedRef: unknown) {
  const expected = envRef(expectedRef)
  if (!expected) return false
  if (isBcryptHash(expected)) return bcrypt.compare(password, expected)
  if (process.env.INTENTSTACK_ALLOW_PLAIN_PASSWORDS === 'true' && process.env.NODE_ENV !== 'production') {
    return safeEqual(password, expected)
  }
  return false
}

async function authenticate(body: Record<string, unknown>) {
  if (AUTH_USERS.length === 0) {
    if (process.env.INTENTSTACK_DEV_AUTH === 'true' && process.env.NODE_ENV !== 'production') return { role: 'authenticated', user: null }
    return null
  }
  const id = typeof body.username === 'string' ? body.username : typeof body.id === 'string' ? body.id : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const users = AUTH_USERS as readonly { id: string; role: string; password?: string }[]
  const user = users.find((item) => item.id === id)
  if (!user || !(await verifyPassword(password, user.password))) return null
  return { role: user.role, user: user.id }
}

export function assertRole(c: Context, allowed: readonly string[]) {
  const https = assertHttps(c.req.raw)
  if (https) return https
  if (allowed.length === 0) return null
  const auth = readSession(c)
  if (auth && isAllowed(auth.session.role, allowed)) return assertCsrf(c, auth)
  return c.json({ error: 'forbidden', required_roles: allowed }, 403)
}

export const authRoutes = new Hono()

authRoutes.post('/auth/login', async (c) => {
  const https = assertHttps(c.req.raw)
  if (https) return https
  const body = await c.req.json().catch(() => ({}))
  const auth = await authenticate(body)
  if (!auth) return c.json({ error: 'invalid_credentials' }, 401)
  const session = issueSession(auth.role, auth.user ?? null)
  setSessionCookies(c, session.token, session.csrf, session.maxAge)
  return c.json({ token: session.token, csrf_token: session.csrf, expires_in: session.maxAge, role: auth.role, user: auth.user ?? null })
})

authRoutes.post('/auth/logout', async (c) => {
  const https = assertHttps(c.req.raw)
  if (https) return https
  const auth = readSession(c)
  if (auth) {
    const csrf = assertCsrf(c, auth)
    if (csrf) return csrf
  }
  clearSessionCookies(c)
  return c.json({ ok: true })
})

authRoutes.get('/auth/me', (c) => {
  const https = assertHttps(c.req.raw)
  if (https) return https
  const auth = readSession(c)
  return c.json({ authenticated: Boolean(auth), role: auth?.session.role ?? null, user: auth?.session.sub ?? null })
})
`
}

export function requestAuthTs(graph, banner) {
  return banner + `import bcrypt from 'bcryptjs'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const AUTH_ROLES = ${js(declaredRoles(graph))} as const
export const AUTH_USERS = ${js(declaredUsers(graph))} as const
const SESSION_COOKIE = 'intentstack_session'
const CSRF_COOKIE = 'intentstack_csrf'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

type SessionClaims = {
  sub: string | null
  role: string
  exp: number
  csrf: string
}

type SessionAuth = {
  session: SessionClaims
  transport: 'cookie' | 'bearer'
}

function isAllowed(role: string, allowed: readonly string[]) {
  if (allowed.includes('authenticated')) return role.length > 0
  return allowed.includes(role)
}

function assertHttps(req: Request) {
  if (process.env.NODE_ENV !== 'production') return null
  const proto = req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.replace(':', '')
  return proto === 'https' ? null : Response.json({ error: 'https_required' }, { status: 426 })
}

function sessionTtlSeconds() {
  const n = Number(process.env.INTENTSTACK_SESSION_TTL_SECONDS ?? 60 * 60 * 8)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 60 * 60 * 8
}

function sessionSecret() {
  const secret = process.env.INTENTSTACK_SESSION_SECRET
  if (secret && secret.length >= 32) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('INTENTSTACK_SESSION_SECRET must be set to at least 32 characters in production')
  }
  return 'intentstack-dev-session-secret-change-me'
}

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString('base64url')
}

function hmac(value: string) {
  return createHmac('sha256', sessionSecret()).update(value).digest('base64url')
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

function signSession(claims: SessionClaims) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify(claims))
  const data = \`\${header}.\${payload}\`
  return \`\${data}.\${hmac(data)}\`
}

function parseSession(token: string | undefined | null): SessionClaims | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const data = \`\${parts[0]}.\${parts[1]}\`
  if (!safeEqual(parts[2], hmac(data))) return null
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as SessionClaims
    if (!claims || typeof claims.role !== 'string' || typeof claims.exp !== 'number' || typeof claims.csrf !== 'string') return null
    if (claims.exp <= Math.floor(Date.now() / 1000)) return null
    return claims
  } catch {
    return null
  }
}

function issueSession(role: string, user: string | null) {
  const csrf = randomBytes(32).toString('base64url')
  const maxAge = sessionTtlSeconds()
  const token = signSession({
    sub: user,
    role,
    csrf,
    exp: Math.floor(Date.now() / 1000) + maxAge,
  })
  return { token, csrf, maxAge }
}

function parseCookies(req: Request) {
  const out: Record<string, string> = {}
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const [rawName, ...rest] = part.trim().split('=')
    if (!rawName) continue
    out[rawName] = decodeURIComponent(rest.join('='))
  }
  return out
}

function readSession(req: Request): SessionAuth | null {
  const cookies = parseCookies(req)
  const cookieSession = parseSession(cookies[SESSION_COOKIE])
  if (cookieSession) return { session: cookieSession, transport: 'cookie' }
  const bearer = req.headers.get('authorization')?.match(/^Bearer\\s+(.+)$/i)?.[1]
  const bearerSession = parseSession(bearer)
  return bearerSession ? { session: bearerSession, transport: 'bearer' } : null
}

function assertCsrf(req: Request, auth: SessionAuth) {
  if (auth.transport !== 'cookie' || SAFE_METHODS.has(req.method)) return null
  const cookies = parseCookies(req)
  const cookie = cookies[CSRF_COOKIE] ?? ''
  const header = req.headers.get('x-csrf-token') ?? ''
  if (cookie && header && safeEqual(cookie, header) && safeEqual(auth.session.csrf, header)) return null
  return Response.json({ error: 'csrf_token_invalid' }, { status: 403 })
}

function cookieValue(name: string, value: string, opts: { httpOnly?: boolean; maxAge?: number; secure?: boolean }) {
  const parts = [\`\${name}=\${encodeURIComponent(value)}\`, 'Path=/', 'SameSite=Lax']
  if (opts.httpOnly) parts.push('HttpOnly')
  if (opts.secure) parts.push('Secure')
  if (opts.maxAge != null) parts.push(\`Max-Age=\${opts.maxAge}\`)
  return parts.join('; ')
}

function sessionCookieHeaders(req: Request, token: string, csrf: string, maxAge: number) {
  const secure = process.env.NODE_ENV === 'production' || req.headers.get('x-forwarded-proto') === 'https'
  const headers = new Headers()
  headers.append('Set-Cookie', cookieValue(SESSION_COOKIE, token, { httpOnly: true, secure, maxAge }))
  headers.append('Set-Cookie', cookieValue(CSRF_COOKIE, csrf, { secure, maxAge }))
  return headers
}

function clearCookieHeaders(req: Request) {
  const secure = process.env.NODE_ENV === 'production' || req.headers.get('x-forwarded-proto') === 'https'
  const headers = new Headers()
  headers.append('Set-Cookie', cookieValue(SESSION_COOKIE, '', { httpOnly: true, secure, maxAge: 0 }))
  headers.append('Set-Cookie', cookieValue(CSRF_COOKIE, '', { secure, maxAge: 0 }))
  return headers
}

function envRef(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('env:')) return null
  return process.env[value.slice(4)] ?? null
}

function isBcryptHash(value: string) {
  return /^\\$2[aby]\\$\\d{2}\\$/.test(value)
}

async function verifyPassword(password: string, expectedRef: unknown) {
  const expected = envRef(expectedRef)
  if (!expected) return false
  if (isBcryptHash(expected)) return bcrypt.compare(password, expected)
  if (process.env.INTENTSTACK_ALLOW_PLAIN_PASSWORDS === 'true' && process.env.NODE_ENV !== 'production') {
    return safeEqual(password, expected)
  }
  return false
}

async function authenticate(body: Record<string, unknown>) {
  if (AUTH_USERS.length === 0) {
    if (process.env.INTENTSTACK_DEV_AUTH === 'true' && process.env.NODE_ENV !== 'production') return { role: 'authenticated', user: null }
    return null
  }
  const id = typeof body.username === 'string' ? body.username : typeof body.id === 'string' ? body.id : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const users = AUTH_USERS as readonly { id: string; role: string; password?: string }[]
  const user = users.find((item) => item.id === id)
  if (!user || !(await verifyPassword(password, user.password))) return null
  return { role: user.role, user: user.id }
}

export function assertRequestRole(req: Request, allowed: readonly string[]) {
  const https = assertHttps(req)
  if (https) return https
  if (allowed.length === 0) return null
  const auth = readSession(req)
  if (auth && isAllowed(auth.session.role, allowed)) return assertCsrf(req, auth)
  return Response.json({ error: 'forbidden', required_roles: allowed }, { status: 403 })
}

export async function loginRequest(req: Request) {
  const https = assertHttps(req)
  if (https) return https
  const body = await req.json().catch(() => ({}))
  const auth = await authenticate(body)
  if (!auth) return Response.json({ error: 'invalid_credentials' }, { status: 401 })
  const session = issueSession(auth.role, auth.user ?? null)
  return Response.json(
    { token: session.token, csrf_token: session.csrf, expires_in: session.maxAge, role: auth.role, user: auth.user ?? null },
    { headers: sessionCookieHeaders(req, session.token, session.csrf, session.maxAge) },
  )
}

export function logoutRequest(req: Request) {
  const https = assertHttps(req)
  if (https) return https
  const auth = readSession(req)
  if (auth) {
    const csrf = assertCsrf(req, auth)
    if (csrf) return csrf
  }
  return Response.json({ ok: true }, { headers: clearCookieHeaders(req) })
}

export function meRequest(req: Request) {
  const https = assertHttps(req)
  if (https) return https
  const auth = readSession(req)
  return Response.json({ authenticated: Boolean(auth), role: auth?.session.role ?? null, user: auth?.session.sub ?? null })
}
`
}

export function workflowsTs(graph, banner) {
  return banner + `import { appendFile, readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

export const WORKFLOWS = ${js(graph.workflows || [])} as const
export const WORKFLOW_INTEGRATIONS = ${js(graph.integrations || [])} as const

export type WorkflowDispatch = {
  action: string
  payload: unknown
}

const RUN_LOG = join(process.cwd(), '.intentstack-workflows.ndjson')

function envRef(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('env:')) return null
  return process.env[value.slice(4)] ?? null
}

async function runStep(workflow: { id: string }, step: { type: string; integration?: string }, payload: unknown) {
  if (step.type === 'webhook' && step.integration) {
    const integrations = WORKFLOW_INTEGRATIONS as readonly { id: string; config?: Record<string, unknown> }[]
    const integration = integrations.find((item) => item.id === step.integration)
    const url = envRef(integration?.config?.url)
    if (!url) return { type: step.type, integration: step.integration, status: 'skipped_missing_url' }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflow: workflow.id, payload }),
    })
    return { type: step.type, integration: step.integration, status: res.ok ? 'sent' : 'failed', status_code: res.status }
  }
  if (step.type === 'email') return { type: step.type, integration: step.integration, status: 'queued_notification' }
  if (step.type === 'background_job') return { type: step.type, integration: step.integration, status: 'queued_job' }
  if (step.type === 'state_transition') return { type: step.type, integration: step.integration, status: 'transitioned', to: (step as { to?: string }).to ?? (step as { state?: string }).state ?? 'next' }
  if (step.type === 'approval') return { type: step.type, integration: step.integration, status: 'pending_approval' }
  return { type: step.type, integration: step.integration, status: 'queued' }
}

function maxAttempts(workflow: { retry?: { max_attempts?: number; attempts?: number } }) {
  const configured = workflow.retry?.max_attempts ?? workflow.retry?.attempts ?? process.env.INTENTSTACK_WORKFLOW_MAX_ATTEMPTS ?? 1
  const n = Number(configured)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1
}

function finalStatus(steps: Array<{ status: string }>) {
  if (steps.some((step) => step.status === 'failed')) return 'failed'
  if (steps.some((step) => step.status === 'pending_approval')) return 'pending'
  return 'succeeded'
}

async function recordWorkflowEvent(event: Record<string, unknown>) {
  await appendFile(RUN_LOG, JSON.stringify({ ...event, recordedAt: new Date().toISOString() }) + '\\n')
}

async function runWorkflow(workflow: { id: string; trigger?: { action?: string }; steps?: readonly { type: string; integration?: string }[]; retry?: { max_attempts?: number; attempts?: number } }, action: string, payload: unknown) {
  const runId = randomUUID()
  await recordWorkflowEvent({ run_id: runId, id: workflow.id, action, status: 'queued', attempts: 0 })
  let attempts = 0
  let steps: Array<Record<string, unknown> & { status: string }> = []
  let status = 'failed'
  while (attempts < maxAttempts(workflow)) {
    attempts += 1
    await recordWorkflowEvent({ run_id: runId, id: workflow.id, action, status: 'running', attempt: attempts })
    steps = []
    for (const step of workflow.steps ?? []) steps.push(await runStep(workflow, step, payload))
    status = finalStatus(steps)
    if (status !== 'failed') break
  }
  const result = { run_id: runId, id: workflow.id, action, status, attempts, steps, createdAt: new Date().toISOString() }
  await recordWorkflowEvent(result)
  return result
}

export async function runWorkflows(action: string, payload: unknown) {
  const matched = WORKFLOWS.filter((workflow) => workflow.trigger?.action === action)
  const results = []
  for (const workflow of matched) results.push(await runWorkflow(workflow, action, payload))
  return results
}

export async function readWorkflowEvents() {
  const text = await readFile(RUN_LOG, 'utf8').catch(() => '')
  return text.split(/\\r?\\n/).filter(Boolean).map((line) => JSON.parse(line))
}

export async function readWorkflowRuns() {
  const events = await readWorkflowEvents()
  const runs = new Map<string, Record<string, unknown>>()
  for (const event of events) {
    const id = event.run_id || event.id || String(runs.size)
    runs.set(String(id), { ...(runs.get(String(id)) || {}), ...event })
  }
  return [...runs.values()]
}
`
}

export function integrationsTs(graph, banner) {
  return banner + `export const INTEGRATIONS = ${js(graph.integrations || [])} as const

export function getIntegration(id: string) {
  return INTEGRATIONS.find((integration) => integration.id === id) ?? null
}

function envRef(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('env:')) return null
  return process.env[value.slice(4)] ?? null
}

async function postJson(url: string, payload: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return { ok: res.ok, status: res.status }
}

export async function callIntegration(id: string, payload: unknown) {
  const integration = getIntegration(id) as { id: string; type: string; config?: Record<string, unknown> } | null
  if (!integration) return { ok: false, error: 'unknown_integration' }
  const url = envRef(integration.config?.url)
  if (!url) return { ok: false, error: 'missing_url' }
  return postJson(url, { integration: integration.id, type: integration.type, payload })
}

export const sendEmail = (id: string, payload: unknown) => callIntegration(id, payload)
export const sendTelegram = (id: string, payload: unknown) => callIntegration(id, payload)
export const sendWhatsapp = (id: string, payload: unknown) => callIntegration(id, payload)
export const syncCrm = (id: string, payload: unknown) => callIntegration(id, payload)
export const callExternalApi = (id: string, payload: unknown) => callIntegration(id, payload)
export const createPayment = (id: string, payload: unknown) => callIntegration(id, payload)
`
}
