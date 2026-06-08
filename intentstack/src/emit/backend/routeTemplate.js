import { BANNER_TS } from '../util.js'
import { isActivePolicy, roleLiteral } from '../shared/modules.js'

export function routeTs(entity, actions, opts) {
  const t = entity.id.toLowerCase()
  const base = entity.table || t
  const has = (type) => actions.some((a) => a.type === type)
  const action = (type) => actions.find((a) => a.type === type)
  const hasSubscribe = has('subscribe_records')
  const tenant = opts.tenancy
  const tenantWhere = tenant ? `.where(eq(${t}.tenantId, tenant))` : ''
  const idWhere = (idExpr = 'id') => tenant ? `and(eq(${t}.id, ${idExpr}), eq(${t}.tenantId, tenant))` : `eq(${t}.id, ${idExpr})`

  let out = BANNER_TS + `import { Hono } from 'hono'
import { db } from '../db/client'
import { ${t} } from '../db/schema'
import { eq, desc${tenant ? ', and' : ''} } from 'drizzle-orm'
import { ${t}CreateSchema } from '../validators/${t}'
${opts.useAuth ? `import { assertRole } from '../auth'` : ''}${opts.useAuth && opts.useWorkflows ? '\\n' : ''}${opts.useWorkflows ? `import { runWorkflows } from '../workflows'` : ''}
${hasSubscribe ? "import { streamSSE } from 'hono/streaming'" : ''}

const r = new Hono()
${tenant ? `\nfunction readTenant(c: any) {\n  const value = c.req.header(${JSON.stringify(tenant.header)}) || c.req.query('tenant_id') || ''\n  return String(value).trim()\n}\n\nfunction tenantError(c: any) {\n  return c.json({ error: 'tenant_required', header: ${JSON.stringify(tenant.header)} }, 400)\n}\n` : ''}`

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
  const result = await db.transaction((tx) => tx.insert(${t}).values({ ...parsed.data${tenant ? ', tenantId: tenant' : ''}, createdAt: new Date() }).returning())
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
  const result = await db.transaction((tx) => tx.update(${t}).set(parsed.data).where(${idWhere()}).returning())
  if (result.length === 0) return c.json({ error: 'not_found' }, 404)
${workflowCall(opts, action('update_record'), 'result[0]')}
  return c.json({ data: result[0] })
})
`
  if (has('delete_record')) out += `
r.delete('/${base}/:id', async (c) => {
${authGuard(action('delete_record'))}
${tenantGuard(tenant, 'c')}  const id = Number(c.req.param('id'))
  await db.transaction((tx) => tx.delete(${t}).where(${idWhere()}))
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
  out += `
export default r
`
  return out
}

export function authGuard(action) {
  if (!action || !isActivePolicy(action.auth)) return ''
  return `  const auth = await assertRole(c, ${roleLiteral(action.auth)})
  if (auth) return auth
`
}

export function tenantGuard(tenant, cName) {
  if (!tenant) return ''
  return `  const tenant = readTenant(${cName})
  if (!tenant) return tenantError(${cName})
`
}

export function workflowCall(opts, action, payloadExpr) {
  if (!opts.useWorkflows || !action) return ''
  return `  await runWorkflows(${JSON.stringify(action.id)}, ${payloadExpr})
`
}
