export function integrationsTs(graph, banner) {
  return banner + `export const INTEGRATIONS = ${JSON.stringify(graph.integrations || [])} as const

export function getIntegration(id: string) {
  return INTEGRATIONS.find((integration) => integration.id === id) ?? null
}

function envRef(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('env:')) return null
  return process.env[value.slice(4)] ?? null
}

function authHeaders(integration: { config?: Record<string, unknown> }): Record<string, string> {
  const token = envRef(integration.config?.token) || envRef(integration.config?.api_key)
  return token ? { Authorization: \`Bearer \${token}\` } : {}
}

function configuredValue(integration: { config?: Record<string, unknown> }, key: string) {
  return envRef(integration.config?.[key]) || integration.config?.[key] || undefined
}

async function postJson(url: string, payload: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  })
  return { ok: res.ok, status: res.status }
}

export async function callIntegration(id: string, payload: unknown) {
  const integration = getIntegration(id) as { id: string; type: string; config?: Record<string, unknown> } | null
  if (!integration) return { ok: false, error: 'unknown_integration' }
  const url = envRef(integration.config?.url)
  if (!url) return { ok: false, error: 'missing_url' }
  return postJson(url, { integration: integration.id, type: integration.type, payload }, authHeaders(integration))
}

export async function sendEmail(id: string, payload: { to?: string; subject?: string; text?: string; html?: string }) {
  return callIntegration(id, { provider: 'email', message: payload })
}

export async function sendTelegram(id: string, payload: { chat_id?: string; text?: string }) {
  const integration = getIntegration(id) as { config?: Record<string, unknown> } | null
  return callIntegration(id, {
    provider: 'telegram',
    method: 'sendMessage',
    chat_id: payload.chat_id || (integration ? configuredValue(integration, 'chat_id') : undefined),
    text: payload.text,
  })
}

export async function sendWhatsapp(id: string, payload: { to?: string; text?: string; template?: string }) {
  return callIntegration(id, { provider: 'whatsapp', message: payload })
}

export async function syncCrm(id: string, payload: { object?: string; operation?: string; data?: unknown }) {
  return callIntegration(id, { provider: 'crm', operation: payload.operation || 'upsert', object: payload.object || 'record', data: payload.data })
}

export async function callExternalApi(id: string, payload: { method?: string; path?: string; body?: unknown }) {
  return callIntegration(id, { provider: 'external_api', method: payload.method || 'POST', path: payload.path || '/', body: payload.body })
}

export async function createPayment(id: string, payload: { amount?: number; currency?: string; customer?: unknown; metadata?: unknown }) {
  return callIntegration(id, { provider: 'payment', amount: payload.amount, currency: payload.currency || 'USD', customer: payload.customer, metadata: payload.metadata })
}
`
}
