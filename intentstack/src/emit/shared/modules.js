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

function isAllowed(role: string, allowed: readonly string[]) {
  if (allowed.includes('authenticated')) return role.length > 0
  return allowed.includes(role)
}

export function ProtectedPage({ roles, children }: { roles: readonly string[]; children: ReactNode }) {
  const [role, setRole] = useState('')
  useEffect(() => {
    setRole(window.localStorage.getItem('intentstack.role') ?? '')
  }, [])
  if (roles.length === 0 || isAllowed(role, roles)) return <>{children}</>
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

export const AUTH_ROLES = ${js(declaredRoles(graph))} as const
export const AUTH_USERS = ${js(declaredUsers(graph))} as const
const sessions = new Map<string, { role: string; createdAt: number }>()

function isAllowed(role: string, allowed: readonly string[]) {
  if (allowed.includes('authenticated')) return role.length > 0
  return allowed.includes(role)
}

function readRole(c: Context) {
  const bearer = c.req.header('authorization')?.match(/^Bearer\\s+(.+)$/i)?.[1]
  if (bearer) return sessions.get(bearer)?.role ?? ''
  return c.req.header('x-intentstack-role') ?? ''
}

function envRef(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('env:')) return null
  return process.env[value.slice(4)] ?? null
}

function authenticate(body: Record<string, unknown>) {
  if (AUTH_USERS.length === 0) {
    const role = typeof body.role === 'string' ? body.role : 'authenticated'
    return AUTH_ROLES.includes(role as typeof AUTH_ROLES[number]) ? { role } : null
  }
  const id = typeof body.username === 'string' ? body.username : typeof body.id === 'string' ? body.id : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const users = AUTH_USERS as readonly { id: string; role: string; password?: string }[]
  const user = users.find((item) => item.id === id)
  const expected = envRef(user?.password)
  if (!user || !expected || password !== expected) return null
  return { role: user.role, user: user.id }
}

export function assertRole(c: Context, allowed: readonly string[]) {
  if (allowed.length === 0) return null
  const role = readRole(c)
  if (isAllowed(role, allowed)) return null
  return c.json({ error: 'forbidden', required_roles: allowed }, 403)
}

export const authRoutes = new Hono()

authRoutes.post('/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const auth = authenticate(body)
  if (!auth) return c.json({ error: 'invalid_credentials' }, 401)
  const token = crypto.randomUUID()
  sessions.set(token, { role: auth.role, createdAt: Date.now() })
  return c.json({ token, role: auth.role, user: auth.user ?? null })
})

authRoutes.post('/auth/logout', async (c) => {
  const bearer = c.req.header('authorization')?.match(/^Bearer\\s+(.+)$/i)?.[1]
  if (bearer) sessions.delete(bearer)
  return c.json({ ok: true })
})

authRoutes.get('/auth/me', (c) => {
  const role = readRole(c)
  return c.json({ authenticated: role.length > 0, role: role || null })
})
`
}

export function requestAuthTs(graph, banner) {
  return banner + `export const AUTH_ROLES = ${js(declaredRoles(graph))} as const
export const AUTH_USERS = ${js(declaredUsers(graph))} as const
const sessions = new Map<string, { role: string; createdAt: number }>()

function isAllowed(role: string, allowed: readonly string[]) {
  if (allowed.includes('authenticated')) return role.length > 0
  return allowed.includes(role)
}

function readRole(req: Request) {
  const bearer = req.headers.get('authorization')?.match(/^Bearer\\s+(.+)$/i)?.[1]
  if (bearer) return sessions.get(bearer)?.role ?? ''
  return req.headers.get('x-intentstack-role') ?? ''
}

function envRef(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('env:')) return null
  return process.env[value.slice(4)] ?? null
}

function authenticate(body: Record<string, unknown>) {
  if (AUTH_USERS.length === 0) {
    const role = typeof body.role === 'string' ? body.role : 'authenticated'
    return AUTH_ROLES.includes(role as typeof AUTH_ROLES[number]) ? { role } : null
  }
  const id = typeof body.username === 'string' ? body.username : typeof body.id === 'string' ? body.id : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const users = AUTH_USERS as readonly { id: string; role: string; password?: string }[]
  const user = users.find((item) => item.id === id)
  const expected = envRef(user?.password)
  if (!user || !expected || password !== expected) return null
  return { role: user.role, user: user.id }
}

export function assertRequestRole(req: Request, allowed: readonly string[]) {
  if (allowed.length === 0) return null
  const role = readRole(req)
  if (isAllowed(role, allowed)) return null
  return Response.json({ error: 'forbidden', required_roles: allowed }, { status: 403 })
}

export async function loginRequest(req: Request) {
  const body = await req.json().catch(() => ({}))
  const auth = authenticate(body)
  if (!auth) return Response.json({ error: 'invalid_credentials' }, { status: 401 })
  const token = crypto.randomUUID()
  sessions.set(token, { role: auth.role, createdAt: Date.now() })
  return Response.json({ token, role: auth.role, user: auth.user ?? null })
}

export function logoutRequest(req: Request) {
  const role = req.headers.get('x-intentstack-role') ?? ''
  const bearer = req.headers.get('authorization')?.match(/^Bearer\\s+(.+)$/i)?.[1]
  if (bearer) sessions.delete(bearer)
  return Response.json({ ok: true, role: role || null })
}

export function meRequest(req: Request) {
  const role = readRole(req)
  return Response.json({ authenticated: role.length > 0, role: role || null })
}
`
}

export function workflowsTs(graph, banner) {
  return banner + `import { appendFile, readFile } from 'node:fs/promises'
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

export async function runWorkflows(action: string, payload: unknown) {
  const matched = WORKFLOWS.filter((workflow) => workflow.trigger?.action === action)
  const results = []
  for (const workflow of matched) {
    const steps = []
    for (const step of workflow.steps ?? []) steps.push(await runStep(workflow, step, payload))
    results.push({ id: workflow.id, action, status: 'processed', steps, createdAt: new Date().toISOString() })
  }
  for (const result of results) await appendFile(RUN_LOG, JSON.stringify(result) + '\\n')
  return results
}

export async function readWorkflowRuns() {
  const text = await readFile(RUN_LOG, 'utf8').catch(() => '')
  return text.split(/\\r?\\n/).filter(Boolean).map((line) => JSON.parse(line))
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
