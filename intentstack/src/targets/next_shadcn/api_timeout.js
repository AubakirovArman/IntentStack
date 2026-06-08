import { BANNER } from './constants.js'

export function routeTimeoutHelper() {
  return BANNER + `export async function withRouteTimeout(method: string, path: string, work: () => Promise<Response>) {
  const timeoutMs = routeTimeoutMs(method, path)
  if (timeoutMs <= 0) return work()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<Response>((resolve) => {
    timer = setTimeout(() => {
      resolve(Response.json({ error: 'route_timeout', timeout_ms: timeoutMs }, { status: 504 }))
    }, timeoutMs)
  })
  try {
    return await Promise.race([work(), timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function routeTimeoutMs(method: string, path: string) {
  return numberEnv('INTENTSTACK_ROUTE_TIMEOUT_MS_' + routeEnvSlug(method, path), numberEnv('INTENTSTACK_ROUTE_TIMEOUT_MS', 30000))
}

function routeEnvSlug(method: string, path: string) {
  return (method + '_' + path).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) ? value : fallback
}
`
}
