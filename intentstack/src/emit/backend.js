// Backend adapter: Action nodes -> Hono routes + server entrypoint.
import { BANNER_TS } from './util.js'
import { RECORD_ACTIONS } from '../registry.js'
import { hasActionAuth, hasPageAuth, honoAuthTs, integrationsTs, isActivePolicy, roleLiteral, workflowsTs } from './shared/modules.js'

export function emitBackend(graph) {
  const files = {}
  const recordActions = graph.actions.filter((a) => RECORD_ACTIONS.includes(a.type))
  const useAuth = hasActionAuth(recordActions) || hasPageAuth(graph)
  const useWorkflows = (graph.workflows || []).length > 0
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
    files[`server/generated/routes/${fname}.ts`] = routeTs(e, acts, { useAuth, useWorkflows })
    imports.push(`import ${fname}Routes from './generated/routes/${fname}'`)
    mounts.push(`app.route('/api', ${fname}Routes)`)
  }
  if (useAuth) files['server/generated/auth.ts'] = honoAuthTs(graph, BANNER_TS)
  if (useWorkflows) files['server/generated/workflows.ts'] = workflowsTs(graph, BANNER_TS)
  if ((graph.integrations || []).length > 0) files['server/generated/integrations.ts'] = integrationsTs(graph, BANNER_TS)
  files['server/index.ts'] = indexTs(imports, mounts)
  return files
}

function indexTs(imports, mounts) {
  return BANNER_TS + `import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { migrate } from './generated/db/client'
${imports.join('\n')}

const app = new Hono()
app.use('/api/*', cors())
app.get('/api/health', (c) => c.json({ ok: true }))
${mounts.join('\n')}

const port = Number(process.env.PORT ?? 8787)
await migrate()
serve({ fetch: app.fetch, port })
console.log(\`[intentstack] API listening on http://localhost:\${port}\`)
`
}

function routeTs(entity, actions, opts) {
  const t = entity.id.toLowerCase()
  const base = entity.table || t
  const has = (type) => actions.some((a) => a.type === type)
  const action = (type) => actions.find((a) => a.type === type)

  let out = BANNER_TS + `import { Hono } from 'hono'
import { db } from '../db/client'
import { ${t} } from '../db/schema'
import { eq, desc } from 'drizzle-orm'
import { ${t}CreateSchema } from '../validators/${t}'
${opts.useAuth ? `import { assertRole } from '../auth'\n` : ''}${opts.useWorkflows ? `import { runWorkflows } from '../workflows'\n` : ''}

const r = new Hono()
`
  if (has('list_records')) out += `
r.get('/${base}', async (c) => {
${authGuard(action('list_records'))}
  const rows = await db.select().from(${t}).orderBy(desc(${t}.createdAt))
  return c.json({ data: rows })
})
`
  if (has('get_record')) out += `
r.get('/${base}/:id', async (c) => {
${authGuard(action('get_record'))}
  const id = Number(c.req.param('id'))
  const rows = await db.select().from(${t}).where(eq(${t}.id, id))
  if (rows.length === 0) return c.json({ error: 'not_found' }, 404)
  return c.json({ data: rows[0] })
})
`
  if (has('create_record')) out += `
r.post('/${base}', async (c) => {
${authGuard(action('create_record'))}
  const body = await c.req.json().catch(() => null)
  const parsed = ${t}CreateSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'validation', details: parsed.error.flatten() }, 400)
  const result = await db.insert(${t}).values({ ...parsed.data, createdAt: new Date() }).returning()
${workflowCall(opts, action('create_record'), 'result[0]')}
  return c.json({ data: result[0] }, 201)
})
`
  if (has('update_record')) out += `
r.put('/${base}/:id', async (c) => {
${authGuard(action('update_record'))}
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => null)
  const parsed = ${t}CreateSchema.partial().safeParse(body)
  if (!parsed.success) return c.json({ error: 'validation', details: parsed.error.flatten() }, 400)
  const result = await db.update(${t}).set(parsed.data).where(eq(${t}.id, id)).returning()
  if (result.length === 0) return c.json({ error: 'not_found' }, 404)
${workflowCall(opts, action('update_record'), 'result[0]')}
  return c.json({ data: result[0] })
})
`
  if (has('delete_record')) out += `
r.delete('/${base}/:id', async (c) => {
${authGuard(action('delete_record'))}
  const id = Number(c.req.param('id'))
  await db.delete(${t}).where(eq(${t}.id, id))
${workflowCall(opts, action('delete_record'), '{ id }')}
  return c.json({ ok: true })
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

function workflowCall(opts, action, payloadExpr) {
  if (!opts.useWorkflows || !action) return ''
  return `  await runWorkflows(${JSON.stringify(action.id)}, ${payloadExpr})
`
}
