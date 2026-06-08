export function websocketTs(entity, opts) {
  const t = entity.id.toLowerCase()
  const base = entity.table || t
  const tenant = opts.tenancy
  const tenantWhere = tenant ? `.where(eq(${t}.tenantId, tenant))` : ''
  const mountName = `mount${entity.id}WebSocket`
  return `import { BANNER_TS } from '../util.js'
import type { IncomingMessage, Server } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { db } from '../db/client'
import { ${t} } from '../db/schema'
import { desc${tenant ? ', eq' : ''} } from 'drizzle-orm'

export function ${mountName}(server: Server) {
  const wss = new WebSocketServer({ noServer: true })
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', 'http://intentstack.local')
    if (url.pathname !== '/api/${base}/ws') return
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request)
    })
  })
  wss.on('connection', (ws, request) => {
    const url = new URL(request.url || '/', 'http://intentstack.local')
${tenant ? `    const tenant = readTenant(request, url)
    if (!tenant) {
      ws.close(1008, 'tenant_required')
      return
    }
` : ''}    const send = async () => {
      if (ws.readyState !== WebSocket.OPEN) return
      const rows = await db.select().from(${t})${tenantWhere}.orderBy(desc(${t}.createdAt))
      ws.send(JSON.stringify({ event: 'records', data: rows }))
    }
    const timer = setInterval(() => void send(), 2000)
    ws.on('close', () => clearInterval(timer))
    ws.on('error', () => clearInterval(timer))
    void send()
  })
}
${tenant ? `\nfunction readTenant(request: IncomingMessage, url: URL) {
  const header = request.headers[${JSON.stringify(tenant.header.toLowerCase())}]
  const value = Array.isArray(header) ? header[0] : header
  return String(value || url.searchParams.get('tenant_id') || '').trim()
}
` : ''}`
}
