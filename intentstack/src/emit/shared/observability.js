export function otelTs(graph, banner) {
  const serviceName = graph.project?.id || graph.project?.name || 'intentstack-generated'
  return banner + `export type OTelAttributeValue = string | number | boolean | null | undefined

export type OTelSpanInput = {
  name: string
  traceId: string
  spanId: string
  parentSpanId?: string
  startTimeUnixNano?: string
  endTimeUnixNano?: string
  attributes?: Record<string, OTelAttributeValue>
}

const DEFAULT_SERVICE_NAME = ${JSON.stringify(serviceName)}
const SCOPE_NAME = 'intentstack.generated'

export function nowNanos() {
  return (BigInt(Date.now()) * 1000000n).toString()
}

export function otelEnabled() {
  return Boolean(traceEndpoint())
}

export async function exportSpan(input: OTelSpanInput) {
  const endpoint = traceEndpoint()
  if (!endpoint) return false
  if (!validTraceId(input.traceId) || !validSpanId(input.spanId)) return false
  const started = input.startTimeUnixNano || nowNanos()
  const ended = input.endTimeUnixNano || nowNanos()
  const payload = {
    resourceSpans: [
      {
        resource: {
          attributes: otelAttributes({
            'service.name': process.env.OTEL_SERVICE_NAME || process.env.INTENTSTACK_SERVICE_NAME || DEFAULT_SERVICE_NAME,
            'telemetry.sdk.name': 'intentstack',
            'telemetry.sdk.language': 'typescript',
          }),
        },
        scopeSpans: [
          {
            scope: { name: SCOPE_NAME },
            spans: [
              {
                traceId: input.traceId,
                spanId: input.spanId,
                parentSpanId: validSpanId(input.parentSpanId) ? input.parentSpanId : undefined,
                name: input.name,
                kind: 2,
                startTimeUnixNano: started,
                endTimeUnixNano: ended,
                attributes: otelAttributes(input.attributes || {}),
              },
            ],
          },
        ],
      },
    ],
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      console.warn(JSON.stringify({ level: 'warn', type: 'otel_export_failed', status: res.status }))
      return false
    }
    return true
  } catch (err) {
    console.warn(JSON.stringify({ level: 'warn', type: 'otel_export_error', message: err instanceof Error ? err.message : String(err) }))
    return false
  }
}

function traceEndpoint() {
  const explicit = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
  if (explicit) return explicit
  const base = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  if (!base) return ''
  return base.replace(/\\/+$/, '') + '/v1/traces'
}

function authHeaders() {
  const headers: Record<string, string> = {}
  const raw = process.env.OTEL_EXPORTER_OTLP_HEADERS || ''
  for (const pair of raw.split(',')) {
    const index = pair.indexOf('=')
    if (index <= 0) continue
    const key = pair.slice(0, index).trim()
    const value = pair.slice(index + 1).trim()
    if (key) headers[key] = value
  }
  return headers
}

function otelAttributes(values: Record<string, OTelAttributeValue>) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => ({ key, value: otelValue(value) }))
}

function otelValue(value: OTelAttributeValue) {
  if (typeof value === 'boolean') return { boolValue: value }
  if (typeof value === 'number') return { doubleValue: value }
  return { stringValue: String(value) }
}

function validTraceId(value: unknown) {
  return typeof value === 'string' && /^[a-f0-9]{32}$/i.test(value) && !/^0+$/.test(value)
}

function validSpanId(value: unknown) {
  return typeof value === 'string' && /^[a-f0-9]{16}$/i.test(value) && !/^0+$/.test(value)
}
`
}
