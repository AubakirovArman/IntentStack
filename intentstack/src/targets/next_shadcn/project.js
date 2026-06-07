import { declaredUsers, hasActionAuth, hasPageAuth } from '../../emit/shared/modules.js'
import { dbDriver } from '../../emit/shared/db_driver.js'
import { BANNER, radiusVar } from './constants.js'

export function projectFiles(graph) {
  const id = (graph.project?.id || 'app').toLowerCase().replace(/[^a-z0-9-]/g, '-')
  const name = graph.project?.name || 'IntentStack App'
  const useAuth = hasActionAuth(graph.actions) || hasPageAuth(graph)
  const driver = dbDriver(graph)
  return {
    'package.json': packageJson(id, { useAuth, driver }),
    'tsconfig.json': tsconfig(),
    'next.config.mjs': 'const nextConfig = {}\nexport default nextConfig\n',
    'next-env.d.ts': '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n\n// NOTE: This file should not be edited\n// see https://nextjs.org/docs/app/building-your-application/configuring/typescript for more information.\n',
    'postcss.config.mjs': 'export default {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n}\n',
    'tailwind.config.ts': tailwindConfig(),
    'app/globals.css': globalsCss(graph.theme),
    'app/error.tsx': errorPageTsx(),
    'middleware.ts': middlewareTs(),
    'components.json': componentsJson(),
    '.gitignore': ['node_modules', '.next', ...driver.gitignore, '.env'].join('\n') + '\n',
    '.env.example': envExample(graph, { useAuth, driver }),
    'README.md': appReadme(name, driver),
  }
}

function packageJson(id, opts = {}) {
  const authDeps = opts.useAuth ? { bcryptjs: '^2.4.3' } : {}
  const authDevDeps = opts.useAuth ? { '@types/bcryptjs': '^2.4.6' } : {}
  return JSON.stringify({
    name: `${id}-next`,
    private: true,
    scripts: { dev: 'next dev', build: 'next build', start: 'next start', migrate: 'tsx lib/db/migrate.ts', typecheck: 'tsc --noEmit' },
    dependencies: {
      'class-variance-authority': '^0.7.0',
      clsx: '^2.1.1',
      next: '^14.2.18',
      react: '^18.3.1',
      'react-dom': '^18.3.1',
      'tailwind-merge': '^2.5.4',
      zod: '^3.23.8',
      ...opts.driver.packageDependencies,
      ...authDeps,
    },
    devDependencies: {
      '@types/node': '^22.10.1',
      ...authDevDeps,
      '@types/react': '^18.3.12',
      '@types/react-dom': '^18.3.1',
      autoprefixer: '^10.4.20',
      postcss: '^8.4.49',
      prettier: '^3.4.2',
      tailwindcss: '^3.4.15',
      tsx: '^4.19.2',
      typescript: '^5.7.2',
    },
  }, null, 2) + '\n'
}

function envExample(graph, opts = {}) {
  const lines = [
    ...opts.driver.envExampleLines(graph),
    '# OpenTelemetry OTLP/HTTP trace export. Leave unset to disable.',
    '# OTEL_SERVICE_NAME=intentstack-generated',
    '# OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318',
    '# OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318/v1/traces',
    '# OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer token',
  ]
  if (opts.useAuth) {
    lines.push(
      '',
      'INTENTSTACK_SESSION_SECRET=replace-with-at-least-32-random-characters',
      'INTENTSTACK_SESSION_TTL_SECONDS=28800',
      '# Store bcrypt hashes in auth password env vars. Use INTENTSTACK_ALLOW_PLAIN_PASSWORDS=true only for local demos.',
    )
    for (const user of declaredUsers(graph)) {
      const envName = passwordEnvName(user.password)
      if (envName) lines.push(`# ${envName}=$2b$12$...`)
    }
  }
  if ((graph.workflows || []).length > 0) {
    lines.push('', '# INTENTSTACK_WORKFLOW_MAX_ATTEMPTS=3')
  }
  return lines.join('\n') + '\n'
}

function passwordEnvName(value) {
  return typeof value === 'string' && value.startsWith('env:') ? value.slice(4) : null
}

function middlewareTs() {
  return BANNER + `import { NextResponse } from 'next/server'
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
  console.log(JSON.stringify({
    level: 'info',
    type: 'http_request',
    request_id: requestId,
    correlation_id: correlationId,
    trace_id: traceId,
    span_id: spanId,
    method: req.method,
    path: req.nextUrl.pathname,
  }))
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
    "connect-src 'self' http://localhost:* ws://localhost:*",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join('; ')
}

export const config = {
  matcher: ['/:path*'],
}
`
}

function errorPageTsx() {
  return BANNER + `'use client'
import { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(JSON.stringify({
      level: 'error',
      type: 'react_error_boundary',
      message: error.message,
      digest: error.digest ?? null,
    }))
  }, [error])

  return (
    <main className="min-h-screen bg-background p-8 text-foreground">
      <div className="mx-auto max-w-xl rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-muted-foreground">The page could not render. Check logs for the request id.</p>
        <button type="button" className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  )
}
`
}

function tsconfig() {
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      lib: ['dom', 'dom.iterable', 'esnext'],
      allowJs: false,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: 'preserve',
      incremental: true,
      plugins: [{ name: 'next' }],
      paths: { '@/*': ['./*'] },
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
  }, null, 2) + '\n'
}

function tailwindConfig() {
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
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
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

function globalsCss(theme) {
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
  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
`
}

function componentsJson() {
  return JSON.stringify({
    $schema: 'https://ui.shadcn.com/schema.json',
    style: 'default',
    rsc: true,
    tsx: true,
    tailwind: { config: 'tailwind.config.ts', css: 'app/globals.css', baseColor: 'slate', cssVariables: true, prefix: '' },
    aliases: { components: '@/components', utils: '@/lib/utils' },
  }, null, 2) + '\n'
}

function appReadme(name, driver) {
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
