import {
  appReadme,
  componentsJson,
  errorPageTsx,
  globalsCss,
  middlewareTs,
  tailwindConfig,
} from './project_layout_templates.js'

export function buildProjectFiles(graph, ctx) {
  return {
    'package.json': packageJson(ctx),
    'tsconfig.json': tsconfig(),
    'next.config.mjs': 'const nextConfig = {}\nexport default nextConfig\n',
    'next-env.d.ts': '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n\n// NOTE: This file should not be edited\n// see https://nextjs.org/docs/app/building-your-application/configuring/typescript for more information.\n',
    'postcss.config.mjs': 'export default {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n}\n',
    'tailwind.config.ts': tailwindConfig(),
    'app/globals.css': globalsCss(graph.theme, ctx.radiusVar),
    'app/error.tsx': errorPageTsx(ctx.banner),
    'middleware.ts': middlewareTs(ctx.banner),
    'components.json': componentsJson(),
    '.gitignore': ['node_modules', '.next', ...ctx.driver.gitignore, '.env'].join('\n') + '\n',
    '.env.example': envExample(graph, ctx),
    'README.md': appReadme(graph.project?.name || 'IntentStack App', ctx.driver),
  }
}

function packageJson(ctx) {
  const authDeps = ctx.useAuth ? { bcryptjs: '^2.4.3' } : {}
  const authDevDeps = ctx.useAuth ? { '@types/bcryptjs': '^2.4.6' } : {}
  return JSON.stringify(
    {
      name: `${ctx.id}-next`,
      private: true,
      scripts: {
        dev: 'next dev',
        build: 'next build',
        start: 'next start',
        migrate: 'tsx lib/db/migrate.ts',
        typecheck: 'tsc --noEmit',
      },
      dependencies: {
        'class-variance-authority': '^0.7.0',
        clsx: '^2.1.1',
        next: '^14.2.18',
        react: '^18.3.1',
        'react-dom': '^18.3.1',
        'tailwind-merge': '^2.5.4',
        zod: '^3.23.8',
        ...ctx.driver.packageDependencies,
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
    },
    null,
    2,
  ) + '\n'
}

function envExample(graph, ctx) {
  const lines = [
    ...ctx.driver.envExampleLines(graph),
    '# OpenTelemetry OTEL/HTTP trace export. Leave unset to disable.',
    '# INTENTSTACK_ROUTE_TIMEOUT_MS=30000',
    '# Route override example: INTENTSTACK_ROUTE_TIMEOUT_MS_GET_API_LEADS=10000',
    '# OTEL_SERVICE_NAME=intentstack-generated',
    '# OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318',
    '# OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318/v1/traces',
    '# OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer token',
  ]
  if (ctx.useAuth) {
    lines.push(
      '',
      'INTENTSTACK_SESSION_SECRET=replace-with-at-least-32-random-characters',
      'INTENTSTACK_SESSION_TTL_SECONDS=28800',
      'INTENTSTACK_SESSION_ROTATE_AFTER_SECONDS=14400',
      'INTENTSTACK_PASSWORD_MIN_LENGTH=12',
      'INTENTSTACK_AUTH_LOCKOUT_ATTEMPTS=5',
      'INTENTSTACK_AUTH_LOCKOUT_WINDOW_MS=900000',
      '# Store bcrypt hashes in auth password env vars. Use INTENTSTACK_ALLOW_PLAIN_PASSWORDS=true only for local demos.',
    )
    for (const user of ctx.users) {
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

function tsconfig() {
  return JSON.stringify(
    {
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
    },
    null,
    2,
  ) + '\n'
}
