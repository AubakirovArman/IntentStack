import { BANNER_TS, jsStr, pascal, t } from '../util.js'
import { isActivePolicy, roleLiteral } from '../shared/modules.js'
import { tenancyConfig } from '../shared/tenancy.js'

export function pageTsx(pageComp, page, refs, navName) {
  const imports = [
    navName ? `import { ${navName} } from '../components/${navName}'` : null,
    ...refs.map((n) => `import { ${n} } from '../components/${n}'`),
  ].filter(Boolean).join('\n')
  const nav = navName ? `      <${navName} />\n` : ''
  const body = refs.map((n) => `      <${n} />`).join('\n')
  const wrapClass = page.layout === 'dashboard' ? 'min-h-screen bg-base-200' : 'min-h-screen bg-base-100'
  const heading = page.layout === 'dashboard'
    ? `      <header className="px-6 pt-8"><h1 className="text-2xl font-semibold">${t(page.title || pascal(page.id))}</h1></header>\n`
    : ''
  const authImport = isActivePolicy(page.auth) ? `import { ProtectedPage } from '../auth'\n` : ''
  const open = isActivePolicy(page.auth) ? `    <ProtectedPage roles={${roleLiteral(page.auth)}}>\n` : ''
  const close = isActivePolicy(page.auth) ? `    </ProtectedPage>\n` : ''
  return BANNER_TS + `${imports}
${authImport}

export function ${pageComp}() {
  return (
${open}    <main className="${wrapClass}">
${nav}${heading}${body}
    </main>
${close}  )
}
`
}

export function clientTs(graph) {
  const byEntity = {}
  for (const a of graph.actions || []) {
    if (!a.entity) continue
    ;(byEntity[a.entity] ||= new Set()).add(a.type)
  }
  const tenancy = tenancyConfig(graph)
  let out = BANNER_TS + `const BASE = import.meta.env.VITE_API_URL ?? ''

function csrfToken() {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.split('; ').find((part) => part.startsWith('intentstack_csrf='))
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : ''
}

function csrfHeaders(): Record<string, string> {
  const token = csrfToken()
  return token ? { 'X-CSRF-Token': token } : {}
}

${tenancy ? `function tenantId() {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(${jsStr(tenancy.storageKey)}) ?? ''
}

function tenantHeaders(): Record<string, string> {
  const tenant = tenantId()
  return tenant ? { ${jsStr(tenancy.header)}: tenant } : {}
}

function tenantQuery() {
  const tenant = tenantId()
  return tenant ? '?tenant_id=' + encodeURIComponent(tenant) : ''
}

` : `function tenantHeaders(): Record<string, string> { return {} }
function tenantQuery() { return '' }

`}
function websocketUrl(path: string) {
  const origin = BASE || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8787')
  const url = new URL(path, origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

`
  for (const [eid, types] of Object.entries(byEntity)) {
    const e = graph.getEntity ? graph.getEntity(eid) : null
    const base = e?.table || eid.toLowerCase()
    const P = pascal(eid)
    if (types.has('create_record')) {
      out += `export async function create${P}(payload: Record<string, unknown>) {
  const res = await fetch(\`\${BASE}/api/${base}\`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...tenantHeaders(), ...csrfHeaders() },
    body: JSON.stringify(payload),
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, data: json.data, error: json.error }
}

`
    }
    if (types.has('list_records')) {
      out += `export async function list${P}(): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(\`\${BASE}/api/${base}\`, { credentials: 'include', headers: tenantHeaders() })
  const json = await res.json().catch(() => ({ data: [] }))
  return (json.data ?? []) as Array<Record<string, unknown>>
}

`
    }
    if (types.has('get_record')) {
      out += `export async function get${P}(id: number): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: unknown }> {
  const res = await fetch(BASE + '/api/${base}/' + id, { credentials: 'include', headers: tenantHeaders() })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, data: json.data, error: json.error }
}

`
    }
    if (types.has('update_record')) {
      out += `export async function update${P}(id: number, payload: Record<string, unknown>) {
  const res = await fetch(BASE + '/api/${base}/' + id, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...tenantHeaders(), ...csrfHeaders() },
    body: JSON.stringify(payload),
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, data: json.data, error: json.error }
}

`
    }
    if (types.has('delete_record')) {
      out += `export async function delete${P}(id: number) {
  const res = await fetch(BASE + '/api/${base}/' + id, { method: 'DELETE', credentials: 'include', headers: { ...tenantHeaders(), ...csrfHeaders() } })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, data: json.data, error: json.error }
}

`
    }
    if (types.has('subscribe_records')) {
      out += `export function subscribe${P}(onRecords: (rows: Array<Record<string, unknown>>) => void, onError?: (event: Event) => void) {
  const source = new EventSource(\`\${BASE}/api/${base}/stream\${tenantQuery()}\`, { withCredentials: true })
  source.addEventListener('records', (event) => {
    const json = JSON.parse((event as MessageEvent).data)
    onRecords((json.data ?? []) as Array<Record<string, unknown>>)
  })
  if (onError) source.addEventListener('error', onError)
  return () => source.close()
}

export function subscribe${P}Ws(onRecords: (rows: Array<Record<string, unknown>>) => void, onError?: (event: Event) => void) {
  const socket = new WebSocket(websocketUrl(\`/api/${base}/ws\${tenantQuery()}\`))
  socket.addEventListener('message', (event) => {
    const json = JSON.parse(event.data)
    if (json.event === 'records') onRecords((json.data ?? []) as Array<Record<string, unknown>>)
  })
  if (onError) socket.addEventListener('error', onError)
  return () => socket.close()
}

`
    }
  }
  return out
}

export function mainTsx() {
  return BANNER_TS + `import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppRoutes } from './routes'
import { ErrorBoundary } from './generated/ErrorBoundary'
import { ThemeSwitcher } from './generated/ThemeSwitcher'
import { ToastHost } from './generated/ToastHost'
import './generated/styles/theme.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeSwitcher />
        <AppRoutes />
        <ToastHost />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
`
}

export function errorBoundaryTsx() {
  return BANNER_TS + `import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(JSON.stringify({
      level: 'error',
      type: 'react_error_boundary',
      message: error.message,
      component_stack: errorInfo.componentStack,
    }))
    void reportRuntimeException(error, errorInfo)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="min-h-screen bg-base-100 p-8 text-base-content">
        <div className="mx-auto max-w-xl rounded-lg border border-base-200 bg-base-100 p-6 shadow-sm">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="mt-2 opacity-70">The page could not render. Check the console or server logs for the request id.</p>
          <button type="button" className="btn btn-primary mt-4" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </main>
    )
  }
}

function reportRuntimeException(error: Error, errorInfo: ErrorInfo) {
  fetch('/api/telemetry/exceptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: error.message, stack: error.stack, component_stack: errorInfo.componentStack, url: window.location.href }),
    keepalive: true,
  }).catch(() => {})
}
`
}

export function routesTsx(routes) {
  const imports = routes.map((r) => `import { ${r.comp} } from './generated/pages/${r.comp}'`).join('\n')
  const routeEls = routes.map((r) => `        <Route path=${jsStr(r.path)} element={<${r.comp} />} />`).join('\n')
  return BANNER_TS + `import { Routes, Route } from 'react-router-dom'
${imports}

export function AppRoutes() {
  return (
    <Routes>
${routeEls}
    </Routes>
  )
}
`
}

export function themeCss() {
  return `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`
}

export function indexHtml(graph) {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' http://localhost:* ws://localhost:*",
    "object-src 'none'",
    "frame-src 'none'",
    "form-action 'self'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join('; ')
  return `<!doctype html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <title>${graph.project?.name || 'IntentStack App'}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
}
