import { declaredRoles, declaredUsers } from './policy.js'
import { dbDriver } from './db_driver.js'
import { authSessionStoreImport, authSessionStoreRuntime } from './auth_session_store.js'
const js = (value) => JSON.stringify(value)
export function requestAuthTs(graph, banner = '') {
  const driverId = dbDriver(graph).id
  return banner + `import bcrypt from 'bcryptjs'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
${authSessionStoreImport('@/lib/db/client')}
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
function auditContext(req: Request) {
  const url = new URL(req.url)
  return {
    method: req.method,
    path: url.pathname,
    request_id: req.headers.get('x-request-id'),
    correlation_id: req.headers.get('x-correlation-id'),
  }
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
function parseCookies(req: Request) {
  const out: Record<string, string> = {}
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const [rawName, ...rest] = part.trim().split('=')
    if (!rawName) continue
    out[rawName] = decodeURIComponent(rest.join('='))
  }
  return out
}
async function readSession(req: Request): Promise<SessionAuth | null> {
  const cookies = parseCookies(req)
  const cookieSession = parseSession(cookies[SESSION_COOKIE])
  if (cookieSession && cookies[SESSION_COOKIE] && await verifyStoredSession(cookieSession, cookies[SESSION_COOKIE])) return { session: cookieSession, transport: 'cookie' }
  const bearer = req.headers.get('authorization')?.match(/^Bearer\\s+(.+)$/i)?.[1]
  const bearerSession = parseSession(bearer)
  return bearerSession && bearer && await verifyStoredSession(bearerSession, bearer) ? { session: bearerSession, transport: 'bearer' } : null
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
export async function assertRequestRole(req: Request, allowed: readonly string[]) {
  const https = assertHttps(req)
  if (https) return https
  if (allowed.length === 0) {
    auditAuth('policy_allow', { ...auditContext(req), reason: 'public' })
    return null
  }
  const auth = await readSession(req)
  if (auth && isAllowed(auth.session.role, allowed)) {
    const csrf = assertCsrf(req, auth)
    if (csrf) {
      auditAuth('policy_deny', { ...auditContext(req), reason: 'csrf', role: auth.session.role, required_roles: allowed })
      return csrf
    }
    auditAuth('policy_allow', { ...auditContext(req), role: auth.session.role, required_roles: allowed })
    return null
  }
  auditAuth('policy_deny', { ...auditContext(req), role: auth?.session.role ?? null, required_roles: allowed })
  return Response.json({ error: 'forbidden', required_roles: allowed }, { status: 403 })
}
export async function loginRequest(req: Request) {
  const https = assertHttps(req)
  if (https) return https
  const body = await req.json().catch(() => ({}))
  const id = loginId(body)
  const locked = lockoutSeconds(id)
  if (locked > 0) return Response.json({ error: 'account_locked', retry_after_seconds: locked }, { status: 429 })
  const password = typeof body.password === 'string' ? body.password : ''
  if (password.length < passwordMinLength()) {
    recordLoginFailure(id)
    auditAuth('login_failed', { ...auditContext(req), user: id || null, reason: 'password_policy' })
    return Response.json({ error: 'invalid_credentials' }, { status: 401 })
  }
  const auth = await authenticate(body)
  if (!auth) {
    recordLoginFailure(id)
    auditAuth('login_failed', { ...auditContext(req), user: id || null })
    return Response.json({ error: 'invalid_credentials' }, { status: 401 })
  }
  LOGIN_FAILURES.delete(id)
  const session = await issueSession(auth.role, auth.user ?? null)
  auditAuth('login_success', { ...auditContext(req), role: auth.role, user: auth.user ?? null })
  return Response.json(
    { token: session.token, csrf_token: session.csrf, expires_in: session.maxAge, role: auth.role, user: auth.user ?? null },
    { headers: sessionCookieHeaders(req, session.token, session.csrf, session.maxAge) },
  )
}
export async function logoutRequest(req: Request) {
  const https = assertHttps(req)
  if (https) return https
  const auth = await readSession(req)
  if (auth) {
    const csrf = assertCsrf(req, auth)
    if (csrf) return csrf
  }
  await revokeSessionId(auth?.session.sid)
  auditAuth('logout', { ...auditContext(req), role: auth?.session.role ?? null, user: auth?.session.sub ?? null })
  return Response.json({ ok: true }, { headers: clearCookieHeaders(req) })
}
export async function refreshRequest(req: Request) {
  const https = assertHttps(req)
  if (https) return https
  const auth = await readSession(req)
  if (!auth) return Response.json({ error: 'unauthenticated' }, { status: 401 })
  const csrf = assertCsrf(req, auth)
  if (csrf) return csrf
  const rotated = await rotateSession(auth) ?? await issueSession(auth.session.role, auth.session.sub, auth.session.sid)
  auditAuth('session_rotated', { ...auditContext(req), role: auth.session.role, user: auth.session.sub ?? null })
  return Response.json(
    { token: rotated.token, csrf_token: rotated.csrf, expires_in: rotated.maxAge, rotated: true },
    { headers: sessionCookieHeaders(req, rotated.token, rotated.csrf, rotated.maxAge) },
  )
}
export async function meRequest(req: Request) {
  const https = assertHttps(req)
  if (https) return https
  const auth = await readSession(req)
  return Response.json({ authenticated: Boolean(auth), role: auth?.session.role ?? null, user: auth?.session.sub ?? null })
}
`
}
