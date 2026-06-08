export function middlewareTs(banner) {
  return banner + `import { NextResponse } from 'next/server'
import type { NextFetchEvent, NextRequest } from 'next/server'
import { exportSpan, nowNanos } from './lib/otel'

export function middleware(req: NextRequest, event: NextFetchEvent) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID()
  const correlationId = req.headers.get('x-correlation-id') ?? requestId
  const traceId = traceIdFromHeader(req.headers.get('traceparent')) || newTraceId()
  const spanId = newSpanId()
  const startNanos = nowNanos()
  const res = NextResponse.next()
  res.headers.set('Content-Security-Policy', contentSecurityPolicy())
  res.headers.set('X-Request-Id', requestId)
  res.headers.set('X-Correlation-Id', correlationId)
  res.headers.set('X-Trace-Id', traceId)
  res.headers.set('traceparent', \`00-\${traceId}-\${spanId}-01\`)
  console.log(
    JSON.stringify({
      level: 'info',
      type: 'http_request',
      request_id: requestId,
      correlation_id: correlationId,
      trace_id: traceId,
      span_id: spanId,
      method: req.method,
      path: req.nextUrl.pathname,
    }),
  )
  event.waitUntil(exportSpan({
    name: \`\${req.method} \${req.nextUrl.pathname}\`,
    traceId,
    spanId,
    startTimeUnixNano: startNanos,
    endTimeUnixNano: nowNanos(),
    attributes: {
      'http.request.method': req.method,
      'url.path': req.nextUrl.pathname,
      'http.response.status_code': 200,
      'intentstack.request_id': requestId,
      'intentstack.correlation_id': correlationId,
    },
  }))
  return res
}

function newTraceId() {
  return crypto.randomUUID().replace(/-/g, '')
}

function newSpanId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
}

function traceIdFromHeader(value: string | null) {
  const match = /^00-([a-f0-9]{32})-[a-f0-9]{16}-[a-f0-9]{2}$/i.exec(value || '')
  return match?.[1]?.toLowerCase() || ''
}

function contentSecurityPolicy() {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
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
}

export const config = {
  matcher: ['/:path*'],
}
`
}

export function errorPageTsx(banner) {
  return banner + `'use client'
import { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(
      JSON.stringify({
        level: 'error',
        type: 'react_error_boundary',
        message: error.message,
        digest: error.digest ?? null,
      }),
    )
    void fetch('/api/telemetry/exceptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: error.message, stack: error.stack, digest: error.digest ?? null, url: window.location.href }),
      keepalive: true,
    }).catch(() => {})
  }, [error])

  return (
    <main className="min-h-screen bg-background p-8 text-foreground">
      <div className="mx-auto max-w-xl rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-muted-foreground">The page could not render. Check logs for the request id.</p>
        <button
          type="button"
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          onClick={reset}
        >
          Try again
        </button>
      </div>
    </main>
  )
}
`
}

export function tailwindConfig() {
  return `import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '2rem', screens: { '2xl': '1400px' } },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
    },
  },
  plugins: [],
}

export default config
`
}

export function globalsCss(theme, radiusVar) {
  return `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: ${radiusVar(theme)};
  }
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 6.9%;
    --card-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
`
}

export function componentsJson() {
  return JSON.stringify(
    {
      $schema: 'https://ui.shadcn.com/schema.json',
      style: 'default',
      rsc: true,
      tsx: true,
      tailwind: {
        config: 'tailwind.config.ts',
        css: 'app/globals.css',
        baseColor: 'slate',
        cssVariables: true,
        prefix: '',
      },
      aliases: { components: '@/components', utils: '@/lib/utils' },
    },
    null,
    2,
  ) + '\n'
}

export function appReadme(name, driver) {
  return `# ${name} (Next.js + shadcn/ui)

> Generated by **IntentStack** from the SAME \`intent/app.intent.yaml\` as the
> Vite/daisyUI build - only the target differs. Do not edit \`app/\`, \`components/\`,
> or \`lib/\`; change the intent and re-run the compiler.

\`\`\`bash
npm install
npm run dev     # http://localhost:3000
\`\`\`

${driver.readmeDatabase()}
Submit the form on \`/\`, then open \`/dashboard/leads\`.
`
}
