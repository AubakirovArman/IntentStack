import { RECORD_ACTIONS } from '../../registry.js'
import { hasActionAuth, hasPageAuth, isActivePolicy, roleLiteral } from '../../emit/shared/modules.js'
import { BANNER } from './constants.js'

export function apiRoutes(graph) {
  const files = {}
  files['app/api/health/route.ts'] = BANNER + `export async function GET() {
  return Response.json({ ok: true })
}
`
  files['app/api/metrics/route.ts'] = BANNER + `const startedAt = Date.now()
let requestsTotal = 0

export async function GET() {
  requestsTotal += 1
  const uptimeSeconds = typeof process.uptime === 'function'
    ? process.uptime()
    : Math.round((Date.now() - startedAt) / 1000)
  return Response.json({
    ok: true,
    uptime_seconds: uptimeSeconds,
    started_at: new Date(startedAt).toISOString(),
    requests_total: requestsTotal,
  })
}
`
  if (hasActionAuth(graph.actions) || hasPageAuth(graph)) {
    files['app/api/auth/login/route.ts'] = BANNER + `import { loginRequest } from '@/lib/auth'

export async function POST(req: Request) {
  return loginRequest(req)
}
`
    files['app/api/auth/logout/route.ts'] = BANNER + `import { logoutRequest } from '@/lib/auth'

export async function POST(req: Request) {
  return logoutRequest(req)
}
`
    files['app/api/auth/me/route.ts'] = BANNER + `import { meRequest } from '@/lib/auth'

export async function GET(req: Request) {
  return meRequest(req)
}
`
  }
  const byEntity = {}
  for (const a of graph.actions) {
    if (!a.entity || !RECORD_ACTIONS.includes(a.type)) continue
    ;(byEntity[a.entity] ||= []).push(a)
  }
  const opts = { useAuth: hasActionAuth(graph.actions), useWorkflows: (graph.workflows || []).length > 0 }
  for (const [eid, actions] of Object.entries(byEntity)) {
    const e = graph.getEntity(eid)
    if (!e) continue
    const tname = e.id.toLowerCase()
    const base = e.table || tname
    const types = new Set(actions.map((a) => a.type))
    files[`app/api/${base}/route.ts`] = collectionRoute(tname, types, actions, opts)
    if (types.has('get_record') || types.has('update_record') || types.has('delete_record')) {
      files[`app/api/${base}/[id]/route.ts`] = itemRoute(tname, types, actions, opts)
    }
  }
  return files
}

function collectionRoute(tname, types, actions, opts) {
  const action = (type) => actions.find((a) => a.type === type)
  let out = BANNER + `import { db, ensureMigrated } from '@/lib/db/client'
import { ${tname} } from '@/lib/db/schema'
import { desc } from 'drizzle-orm'
import { ${tname}CreateSchema } from '@/lib/validators/${tname}'
${opts.useAuth ? `import { assertRequestRole } from '@/lib/auth'\n` : ''}${opts.useWorkflows ? `import { runWorkflows } from '@/lib/workflows'\n` : ''}
`
  if (types.has('list_records')) out += `
export async function GET(${isActivePolicy(action('list_records')?.auth) ? 'req: Request' : ''}) {
${nextAuthGuard(action('list_records'), 'req')}
  await ensureMigrated()
  const rows = await db.select().from(${tname}).orderBy(desc(${tname}.createdAt))
  return Response.json({ data: rows })
}
`
  if (types.has('create_record')) out += `
export async function POST(req: Request) {
${nextAuthGuard(action('create_record'), 'req')}
  await ensureMigrated()
  const body = await req.json().catch(() => null)
  const parsed = ${tname}CreateSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'validation', details: parsed.error.flatten() }, { status: 400 })
  const result = await db.insert(${tname}).values({ ...parsed.data, createdAt: new Date() }).returning()
${nextWorkflowCall(opts, action('create_record'), 'result[0]')}
  return Response.json({ data: result[0] }, { status: 201 })
}
`
  return out
}

function itemRoute(tname, types, actions, opts) {
  const imports = [
    `import { db, ensureMigrated } from '@/lib/db/client'`,
    `import { ${tname} } from '@/lib/db/schema'`,
    `import { eq } from 'drizzle-orm'`,
  ]
  if (types.has('update_record')) imports.push(`import { ${tname}CreateSchema } from '@/lib/validators/${tname}'`)
  if (opts.useAuth) imports.push(`import { assertRequestRole } from '@/lib/auth'`)
  if (opts.useWorkflows) imports.push(`import { runWorkflows } from '@/lib/workflows'`)
  const action = (type) => actions.find((a) => a.type === type)
  let out = BANNER + imports.join('\n') + `

type Ctx = { params: { id: string } }
`
  if (types.has('get_record')) out += `
export async function GET(_req: Request, { params }: Ctx) {
${nextAuthGuard(action('get_record'), '_req')}
  await ensureMigrated()
  const rows = await db.select().from(${tname}).where(eq(${tname}.id, Number(params.id)))
  if (rows.length === 0) return Response.json({ error: 'not_found' }, { status: 404 })
  return Response.json({ data: rows[0] })
}
`
  if (types.has('update_record')) out += `
export async function PUT(req: Request, { params }: Ctx) {
${nextAuthGuard(action('update_record'), 'req')}
  await ensureMigrated()
  const body = await req.json().catch(() => null)
  const parsed = ${tname}CreateSchema.partial().safeParse(body)
  if (!parsed.success) return Response.json({ error: 'validation', details: parsed.error.flatten() }, { status: 400 })
  const result = await db.update(${tname}).set(parsed.data).where(eq(${tname}.id, Number(params.id))).returning()
  if (result.length === 0) return Response.json({ error: 'not_found' }, { status: 404 })
${nextWorkflowCall(opts, action('update_record'), 'result[0]')}
  return Response.json({ data: result[0] })
}
`
  if (types.has('delete_record')) out += `
export async function DELETE(_req: Request, { params }: Ctx) {
${nextAuthGuard(action('delete_record'), '_req')}
  await ensureMigrated()
  await db.delete(${tname}).where(eq(${tname}.id, Number(params.id)))
${nextWorkflowCall(opts, action('delete_record'), '{ id: Number(params.id) }')}
  return Response.json({ ok: true })
}
`
  return out
}

function nextAuthGuard(action, reqName) {
  if (!action || !isActivePolicy(action.auth)) return ''
  return `  const auth = assertRequestRole(${reqName}, ${roleLiteral(action.auth)})
  if (auth) return auth
`
}

function nextWorkflowCall(opts, action, payloadExpr) {
  if (!opts.useWorkflows || !action) return ''
  return `  await runWorkflows(${JSON.stringify(action.id)}, ${payloadExpr})
`
}
