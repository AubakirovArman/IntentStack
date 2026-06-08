import { declaredRoles, declaredUsers } from './policy.js'
import { dbDriver } from './db_driver.js'
import { authSessionStoreImport, authSessionStoreRuntime } from './auth_session_store.js'
const js = (value) => JSON.stringify(value)
export function honoAuthTs(graph, banner = '') {
  const driverId = dbDriver(graph).id
  return banner + `import { Hono } from 'hono'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import bcrypt from 'bcryptjs'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
${authSessionStoreImport('./db/client')}
export const AUTH_ROLES = ${js(declaredRoles(graph))} as const
export const AUTH_USERS = ${js(declaredUsers(graph))} as const
const SESSION_COOKIE = 'intentstack_session'
const CSRF_COOKIE = 'intentstack_csrf'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const LOGIN_FAILURES = new Map<string, { count: number; resetAt: number; lockedUntil: number }>()

type SessionClaims = {
  sid: string
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

function auditAuth(event: string, details: Record<string, unknown>) {
  console.log(JSON.stringify({ level: 'info', type: 'auth_audit', event, ...details }))
}
function auditContext(c: Context) {
  const url = new URL(c.req.url)
  return {
    method: c.req.method,
    path: url.pathname,
    request_id: c.res.headers.get('X-Request-Id') || c.req.header('x-request-id') || null,
    correlation_id: c.res.headers.get('X-Correlation-Id') || c.req.header('x-correlation-id') || null,
  }
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
function numberEnv(name: string, fallback: number) { const value = Number(process.env[name]); return Number.isFinite(value) ? value : fallback }
function passwordMinLength() { return Math.max(1, Math.floor(numberEnv('INTENTSTACK_PASSWORD_MIN_LENGTH', 12))) }
function loginId(body: Record<string, unknown>) { return typeof body.username === 'string' ? body.username : typeof body.id === 'string' ? body.id : '' }

function lockoutSeconds(id: string) {
  const state = LOGIN_FAILURES.get(id)
  if (!state) return 0
  if (state.resetAt <= Date.now()) { LOGIN_FAILURES.delete(id); return 0 }
  return state.lockedUntil > Date.now() ? Math.ceil((state.lockedUntil - Date.now()) / 1000) : 0
}
function recordLoginFailure(id: string) {
  if (!id) return
  const now = Date.now()
  const windowMs = numberEnv('INTENTSTACK_AUTH_LOCKOUT_WINDOW_MS', 15 * 60 * 1000)
  const max = Math.max(1, Math.floor(numberEnv('INTENTSTACK_AUTH_LOCKOUT_ATTEMPTS', 5)))
  const previous = LOGIN_FAILURES.get(id)
  const state = !previous || previous.resetAt <= now ? { count: 0, resetAt: now + windowMs, lockedUntil: 0 } : previous
  state.count += 1
  if (state.count >= max) state.lockedUntil = state.resetAt
  LOGIN_FAILURES.set(id, state)
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
${authSessionStoreRuntime(driverId)}
function parseSession(token: string | undefined | null): SessionClaims | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const data = \`\${parts[0]}.\${parts[1]}\`
  if (!safeEqual(parts[2], hmac(data))) return null
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as SessionClaims
    if (!claims || typeof claims.sid !== 'string' || typeof claims.role !== 'string' || typeof claims.exp !== 'number' || typeof claims.csrf !== 'string') return null
    if (claims.exp <= nowSeconds()) return null
    return claims
  } catch {
    return null
  }
}
async function issueSession(role: string, user: string | null, previousSid: string | null = null) {
  const sid = randomBytes(24).toString('base64url')
  const csrf = randomBytes(32).toString('base64url')
  const maxAge = sessionTtlSeconds()
  const claims = {
    sid,
    sub: user,
    role,
    csrf,
    exp: nowSeconds() + maxAge,
  }
  const token = signSession(claims)
  await persistSession(claims, token)
  await revokeSessionId(previousSid)
  return { token, csrf, maxAge }
}
async function readSession(c: Context): Promise<SessionAuth | null> {
  const cookieToken = getCookie(c, SESSION_COOKIE)
  const cookieSession = parseSession(cookieToken)
  if (cookieSession && cookieToken && await verifyStoredSession(cookieSession, cookieToken)) return { session: cookieSession, transport: 'cookie' }
  const bearer = c.req.header('authorization')?.match(/^Bearer\\s+(.+)$/i)?.[1]
  const bearerSession = parseSession(bearer)
  return bearerSession && bearer && await verifyStoredSession(bearerSession, bearer) ? { session: bearerSession, transport: 'bearer' } : null
}
function assertCsrf(c: Context, auth: SessionAuth) {
  if (auth.transport !== 'cookie' || SAFE_METHODS.has(c.req.method)) return null
  const cookie = getCookie(c, CSRF_COOKIE) ?? ''
  const header = c.req.header('x-csrf-token') ?? ''
  if (cookie && header && safeEqual(cookie, header) && safeEqual(auth.session.csrf, header)) return null
  return c.json({ error: 'csrf_token_invalid' }, 403)
}
function cookieSecure(c: Context) {
  return process.env.NODE_ENV === 'production' || c.req.headers.get('x-forwarded-proto') === 'https'
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
export async function assertRole(c: Context, allowed: readonly string[]) {
  const https = assertHttps(c.req.raw)
  if (https) return https
  if (allowed.length === 0) {
    auditAuth('policy_allow', { ...auditContext(c), reason: 'public' })
    return null
  }
  const auth = await readSession(c)
  if (auth && isAllowed(auth.session.role, allowed)) {
    const csrf = assertCsrf(c, auth)
    if (csrf) {
      auditAuth('policy_deny', { ...auditContext(c), reason: 'csrf', role: auth.session.role, required_roles: allowed })
      return csrf
    }
    auditAuth('policy_allow', { ...auditContext(c), role: auth.session.role, required_roles: allowed })
    return null
  }
  auditAuth('policy_deny', { ...auditContext(c), role: auth?.session.role ?? null, required_roles: allowed })
  return c.json({ error: 'forbidden', required_roles: allowed }, 403)
}
export const authRoutes = new Hono()
authRoutes.post('/auth/login', async (c) => {
  const https = assertHttps(c.req.raw)
  if (https) return https
  const body = await c.req.json().catch(() => ({}))
  const id = loginId(body)
  const locked = lockoutSeconds(id)
  if (locked > 0) return c.json({ error: 'account_locked', retry_after_seconds: locked }, 429)
  const password = typeof body.password === 'string' ? body.password : ''
  if (password.length < passwordMinLength()) {
    recordLoginFailure(id)
    auditAuth('login_failed', { ...auditContext(c), user: id || null, reason: 'password_policy' })
    return c.json({ error: 'invalid_credentials' }, 401)
  }
  const auth = await authenticate(body)
  if (!auth) {
    recordLoginFailure(id)
    auditAuth('login_failed', { ...auditContext(c), user: id || null })
    return c.json({ error: 'invalid_credentials' }, 401)
  }
  LOGIN_FAILURES.delete(id)
  const session = await issueSession(auth.role, auth.user ?? null)
  setSessionCookies(c, session.token, session.csrf, session.maxAge)
  auditAuth('login_success', { ...auditContext(c), role: auth.role, user: auth.user ?? null })
  return c.json({ token: session.token, csrf_token: session.csrf, expires_in: session.maxAge, role: auth.role, user: auth.user ?? null })
})
authRoutes.post('/auth/logout', async (c) => {
  const https = assertHttps(c.req.raw)
  if (https) return https
  const auth = await readSession(c)
  if (auth) {
    const csrf = assertCsrf(c, auth)
    if (csrf) return csrf
  }
  await revokeSessionId(auth?.session.sid)
  clearSessionCookies(c)
  auditAuth('logout', { ...auditContext(c), role: auth?.session.role ?? null, user: auth?.session.sub ?? null })
  return c.json({ ok: true })
})
authRoutes.post('/auth/refresh', async (c) => {
  const https = assertHttps(c.req.raw)
  if (https) return https
  const auth = await readSession(c)
  if (!auth) return c.json({ error: 'unauthenticated' }, 401)
  const csrf = assertCsrf(c, auth)
  if (csrf) return csrf
  const rotated = await rotateSession(auth) ?? await issueSession(auth.session.role, auth.session.sub, auth.session.sid)
  setSessionCookies(c, rotated.token, rotated.csrf, rotated.maxAge)
  auditAuth('session_rotated', { ...auditContext(c), role: auth.session.role, user: auth.session.sub ?? null })
  return c.json({ token: rotated.token, csrf_token: rotated.csrf, expires_in: rotated.maxAge, rotated: true })
})
authRoutes.get('/auth/me', async (c) => {
  const https = assertHttps(c.req.raw)
  if (https) return https
  const auth = await readSession(c)
  return c.json({ authenticated: Boolean(auth), role: auth?.session.role ?? null, user: auth?.session.sub ?? null })
})
`
}
