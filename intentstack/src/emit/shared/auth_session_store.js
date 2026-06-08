export function authSessionStoreImport(importPath) {
  return `import { client } from '${importPath}'`
}

export function authSessionStoreRuntime(driverId) {
  return `${commonRuntime()}
${driverId === 'postgres' ? postgresRuntime() : sqliteRuntime()}`
}

function commonRuntime() {
  return `type SessionRow = {
  token_hash?: string
  expires_at?: number | string
  revoked_at?: number | string | null
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

function rotateAfterSeconds() {
  const n = Number(process.env.INTENTSTACK_SESSION_ROTATE_AFTER_SECONDS ?? Math.floor(sessionTtlSeconds() / 2))
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : Math.floor(sessionTtlSeconds() / 2)
}

function sessionTokenHash(token: string) {
  return hmac(token)
}

async function persistSession(claims: SessionClaims, token: string) {
  await pruneExpiredSessions()
  await insertSessionRow(claims, sessionTokenHash(token), nowSeconds())
}

async function verifyStoredSession(claims: SessionClaims, token: string) {
  if (!claims.sid) return false
  const row = await findSessionRow(claims.sid)
  if (!row || row.revoked_at != null) return false
  if (Number(row.expires_at) <= nowSeconds()) return false
  return safeEqual(row.token_hash || '', sessionTokenHash(token))
}

async function rotateSession(auth: SessionAuth) {
  const issuedAt = auth.session.exp - sessionTtlSeconds()
  if (nowSeconds() - issuedAt < rotateAfterSeconds()) return null
  return issueSession(auth.session.role, auth.session.sub, auth.session.sid)
}
`
}

function sqliteRuntime() {
  return `let sessionStoreReady: Promise<void> | null = null

async function ensureSessionStore() {
  if (!sessionStoreReady) {
    sessionStoreReady = (async () => {
      await client.execute('CREATE TABLE IF NOT EXISTS __intentstack_sessions (id text PRIMARY KEY NOT NULL, token_hash text NOT NULL, user_id text, role text NOT NULL, csrf text NOT NULL, expires_at integer NOT NULL, revoked_at integer, created_at integer NOT NULL, rotated_at integer)')
      await client.execute('CREATE INDEX IF NOT EXISTS __intentstack_sessions_expires_at_idx ON __intentstack_sessions (expires_at)')
    })()
  }
  return sessionStoreReady
}

async function insertSessionRow(claims: SessionClaims, tokenHash: string, createdAt: number) {
  await ensureSessionStore()
  await client.execute({
    sql: 'INSERT INTO __intentstack_sessions (id, token_hash, user_id, role, csrf, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [claims.sid, tokenHash, claims.sub, claims.role, claims.csrf, claims.exp, createdAt],
  })
}

async function findSessionRow(id: string) {
  await ensureSessionStore()
  const result = await client.execute({
    sql: 'SELECT token_hash, expires_at, revoked_at FROM __intentstack_sessions WHERE id = ?',
    args: [id],
  })
  return result.rows[0] as SessionRow | undefined
}

async function revokeSessionId(id: string | null | undefined) {
  if (!id) return
  await ensureSessionStore()
  const revokedAt = nowSeconds()
  await client.execute({
    sql: 'UPDATE __intentstack_sessions SET revoked_at = ?, rotated_at = COALESCE(rotated_at, ?) WHERE id = ? AND revoked_at IS NULL',
    args: [revokedAt, revokedAt, id],
  })
}

async function pruneExpiredSessions() {
  await ensureSessionStore()
  await client.execute({ sql: 'DELETE FROM __intentstack_sessions WHERE expires_at <= ?', args: [nowSeconds()] })
}
`
}

function postgresRuntime() {
  return `let sessionStoreReady: Promise<void> | null = null

async function ensureSessionStore() {
  if (!sessionStoreReady) {
    sessionStoreReady = (async () => {
      await client.unsafe('CREATE TABLE IF NOT EXISTS __intentstack_sessions (id text PRIMARY KEY NOT NULL, token_hash text NOT NULL, user_id text, role text NOT NULL, csrf text NOT NULL, expires_at bigint NOT NULL, revoked_at bigint, created_at bigint NOT NULL, rotated_at bigint)')
      await client.unsafe('CREATE INDEX IF NOT EXISTS __intentstack_sessions_expires_at_idx ON __intentstack_sessions (expires_at)')
    })()
  }
  return sessionStoreReady
}

async function insertSessionRow(claims: SessionClaims, tokenHash: string, createdAt: number) {
  await ensureSessionStore()
  await client.unsafe(
    'INSERT INTO __intentstack_sessions (id, token_hash, user_id, role, csrf, expires_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [claims.sid, tokenHash, claims.sub, claims.role, claims.csrf, claims.exp, createdAt],
  )
}

async function findSessionRow(id: string) {
  await ensureSessionStore()
  const rows = await client.unsafe('SELECT token_hash, expires_at, revoked_at FROM __intentstack_sessions WHERE id = $1', [id])
  return rows[0] as SessionRow | undefined
}

async function revokeSessionId(id: string | null | undefined) {
  if (!id) return
  await ensureSessionStore()
  const revokedAt = nowSeconds()
  await client.unsafe(
    'UPDATE __intentstack_sessions SET revoked_at = $1, rotated_at = COALESCE(rotated_at, $2) WHERE id = $3 AND revoked_at IS NULL',
    [revokedAt, revokedAt, id],
  )
}

async function pruneExpiredSessions() {
  await ensureSessionStore()
  await client.unsafe('DELETE FROM __intentstack_sessions WHERE expires_at <= $1', [nowSeconds()])
}
`
}
