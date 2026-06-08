import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { parseIntentFile } from '../src/parse.js'
import { buildGraph } from '../src/graph.js'
import { planFiles } from '../src/emit/index.js'
import { validate } from '../src/validate.js'

const demoIntent = fileURLToPath(new URL('../../demo/intent/app.intent.yaml', import.meta.url))

function withCrudActions(ast) {
  for (const action of [
    { id: 'get_lead', type: 'get_record', entity: 'Lead' },
    { id: 'delete_lead', type: 'delete_record', entity: 'Lead' },
    { id: 'subscribe_leads', type: 'subscribe_records', entity: 'Lead' },
  ]) {
    if (!ast.actions.some((a) => a.id === action.id)) ast.actions.push(action)
  }
  return ast
}

test('web_ts_minimal generates CRUD routes, API client, stats and pricing sections', async () => {
  const ast = withCrudActions(await parseIntentFile(demoIntent))
  ast.pages[1].sections[0].row_actions = [{ type: 'detail' }, { type: 'edit' }, { type: 'delete' }]
  ast.pages[0].sections.splice(3, 0,
    { id: 'metrics', type: 'stats', title: 'Proof', items: [{ label: 'Calls', value: '1000+' }] },
    { id: 'pricing', type: 'pricing_cards', title: 'Plans', items: [{ title: 'Starter', price: '$19', features: ['Email support'] }] },
    { id: 'chart', type: 'chart', title: 'Pipeline', items: [{ label: 'Qualified', value: 42 }, { label: 'Closed', value: 12 }] },
  )
  const files = planFiles(buildGraph(ast))
  const pkg = JSON.parse(files['package.json'])

  assert.match(files['server/index.ts'], /app\.get\('\/api\/health'/)
  assert.match(files['server/index.ts'], /app\.get\('\/api\/metrics'/)
  assert.match(files['server/index.ts'], /\/api\/telemetry\/exceptions/)
  assert.match(files['server/index.ts'], /runtime_exception/)
  assert.match(files['server/index.ts'], /requests_total/)
  assert.match(files['server/index.ts'], /X-Request-Id/)
  assert.match(files['server/index.ts'], /X-Correlation-Id/)
  assert.match(files['server/index.ts'], /request_id/)
  assert.match(files['server/index.ts'], /correlation_id/)
  assert.match(files['server/index.ts'], /allowedCorsOrigin/)
  assert.match(files['server/index.ts'], /INTENTSTACK_CORS_ORIGINS/)
  assert.match(files['server/index.ts'], /rateLimitBuckets/)
  assert.match(files['server/index.ts'], /INTENTSTACK_RATE_LIMIT_MAX/)
  assert.match(files['server/index.ts'], /X-RateLimit-Remaining/)
  assert.match(files['server/index.ts'], /rate_limited/)
  assert.match(files['server/index.ts'], /INTENTSTACK_ROUTE_TIMEOUT_MS/)
  assert.match(files['server/index.ts'], /route_timeout/)
  assert.match(files['server/index.ts'], /traceparent/)
  assert.match(files['server/index.ts'], /X-Trace-Id/)
  assert.match(files['server/index.ts'], /trace_id/)
  assert.match(files['server/index.ts'], /import \{ checkDatabaseHealth, closeDatabase, migrate \} from '\.\/generated\/db\/client'/)
  assert.match(files['server/index.ts'], /import \{ exportSpan, nowNanos \} from '\.\/generated\/otel'/)
  assert.match(files['server/index.ts'], /app\.get\('\/api\/health', async/)
  assert.match(files['server/index.ts'], /database: 'ok'/)
  assert.match(files['server/index.ts'], /await checkDatabaseHealth\(\)/)
  assert.match(files['server/index.ts'], /await closeDatabase\(\)/)
  assert.match(files['server/index.ts'], /void exportSpan\(/)
  assert.match(files['server/generated/otel.ts'], /resourceSpans/)
  assert.match(files['server/generated/otel.ts'], /OTEL_EXPORTER_OTLP_TRACES_ENDPOINT/)
  assert.match(files['server/generated/otel.ts'], /OTEL_EXPORTER_OTLP_ENDPOINT/)
  assert.match(files['server/generated/otel.ts'], /OTEL_EXPORTER_OTLP_HEADERS/)
  assert.match(files['src/main.tsx'], /<ErrorBoundary>/)
  assert.match(files['src/main.tsx'], /<ThemeSwitcher \/>/)
  assert.match(files['src/main.tsx'], /<ToastHost \/>/)
  assert.match(files['src/generated/ToastHost.tsx'], /intentstack:toast/)
  assert.match(files['src/generated/ThemeSwitcher.tsx'], /intentstack\.theme/)
  assert.match(files['src/generated/ErrorBoundary.tsx'], /componentDidCatch/)
  assert.match(files['src/generated/ErrorBoundary.tsx'], /reportRuntimeException/)
  assert.match(files['src/generated/ErrorBoundary.tsx'], /\/api\/telemetry\/exceptions/)
  assert.match(files['src/generated/ErrorBoundary.tsx'], /window\.location\.reload/)
  assert.match(files['server/index.ts'], /Content-Security-Policy/)
  assert.match(files['server/index.ts'], /object-src 'none'/)
  assert.match(files['server/index.ts'], /base-uri 'self'/)
  assert.match(files['index.html'], /Content-Security-Policy/)
  assert.match(files['index.html'], /object-src 'none'/)
  assert.match(files['index.html'], /frame-ancestors 'none'/)
  assert.match(files['server/generated/db/client.ts'], /MIGRATION_MANIFEST/)
  assert.match(files['server/generated/db/client.ts'], /rollbackIntentStackMigration/)
  assert.match(files['server/generated/db/client.ts'], /checkIntentStackSchemaDrift/)
  assert.match(files['server/generated/db/client.ts'], /INTENTSTACK_AUTO_MIGRATE/)
  assert.match(files['server/generated/db/client.ts'], /export async function checkDatabaseHealth/)
  assert.match(files['server/generated/db/client.ts'], /export async function closeDatabase/)
  assert.match(files['server/generated/db/migration_runtime.ts'], /__intentstack_migrations/)
  assert.match(files['server/generated/db/migration_runtime.ts'], /createHash\('sha256'\)/)
  assert.match(files['server/generated/db/migration_runtime.ts'], /different checksum/)
  assert.match(files['server/generated/db/migration_runtime.ts'], /does not match manifest checksum/)
  assert.match(files['server/generated/db/migration_runtime.ts'], /checkDbMigrationDrift/)
  assert.match(files['server/generated/db/migration_runtime.ts'], /rollbackDbMigration/)
  assert.match(files['server/generated/db/migrate.ts'], /runIntentStackMigrations/)
  assert.match(files['server/generated/db/migrate.ts'], /--rollback/)
  assert.match(files['server/generated/db/migrate.ts'], /--drift/)
  assert.equal(pkg.scripts.migrate, 'tsx server/generated/db/migrate.ts')
  assert.equal(pkg.dependencies['@libsql/client'], '^0.14.0')
  assert.equal(pkg.dependencies['drizzle-orm'], '^0.36.4')
  assert.equal(pkg.dependencies.ws, '^8.18.0')
  assert.equal(pkg.devDependencies['@types/ws'], '^8.5.13')
  assert.match(files['.env.example'], /INTENTSTACK_AUTO_MIGRATE/)
  assert.match(files['.env.example'], /INTENTSTACK_CORS_ORIGINS/)
  assert.match(files['.env.example'], /INTENTSTACK_RATE_LIMIT_MAX/)
  assert.match(files['.env.example'], /OTEL_EXPORTER_OTLP_ENDPOINT/)
  assert.ok(files['migrations/manifest.json'])
  assert.ok(files['migrations/0000_init.down.sql'])
  const manifest = JSON.parse(files['migrations/manifest.json'])
  assert.equal(manifest.driver, 'sqlite')
  assert.equal(manifest.migrations[0].id, '0000_init')
  assert.match(manifest.migrations[0].checksum, /^[a-f0-9]{64}$/)
  assert.equal(manifest.migrations[0].rollback_file, 'migrations/0000_init.down.sql')
  assert.match(manifest.migrations[0].rollback_checksum, /^[a-f0-9]{64}$/)
  assert.match(files['server/generated/routes/lead.ts'], /r\.get\('\/leads\/:id'/)
  assert.match(files['server/generated/routes/lead.ts'], /r\.put\('\/leads\/:id'/)
  assert.match(files['server/generated/routes/lead.ts'], /r\.delete\('\/leads\/:id'/)
  assert.match(files['server/generated/routes/lead.ts'], /r\.get\('\/leads\/stream'/)
  assert.match(files['server/generated/routes/lead.ts'], /streamSSE/)
  assert.ok(files['server/generated/realtime/lead.ts'])
  assert.match(files['server/generated/realtime/lead.ts'], /WebSocketServer/)
  assert.match(files['server/generated/realtime/lead.ts'], /\/api\/leads\/ws/)
  assert.match(files['server/index.ts'], /mountLeadWebSocket\(server\)/)
  assert.match(files['server/generated/routes/lead.ts'], /db\.transaction/)
  assert.match(files['server/generated/routes/lead.ts'], /tx\.update\(lead\)\.set\(parsed\.data\)/)
  assert.match(files['src/generated/api/client.ts'], /export async function getLead/)
  assert.match(files['src/generated/api/client.ts'], /export async function updateLead/)
  assert.match(files['src/generated/api/client.ts'], /export async function deleteLead/)
  assert.match(files['src/generated/api/client.ts'], /export function subscribeLead/)
  assert.match(files['src/generated/api/client.ts'], /export function subscribeLeadWs/)
  assert.match(files['src/generated/api/client.ts'], /new WebSocket\(websocketUrl/)
  assert.match(files['src/generated/api/client.ts'], /method: 'PUT'/)
  assert.match(files['src/generated/pages/DashboardLeadDetailPage.tsx'], /<LeadDetail \/>/)
  assert.match(files['src/generated/components/LeadDetail.tsx'], /getLead/)
  assert.match(files['src/generated/components/LeadDetail.tsx'], /updateLead/)
  assert.match(files['src/generated/components/LeadDetail.tsx'], /loading loading-spinner/)
  assert.match(files['src/generated/components/LeadForm.tsx'], /status === 'loading'/)
  assert.match(files['src/generated/components/LeadForm.tsx'], /intentstack:toast/)
  assert.match(files['src/generated/components/LeadForm.tsx'], /hover:scale/)
  assert.match(files['src/generated/components/LeadForm.tsx'], /Something went wrong/)
  assert.match(files['src/generated/components/LeadsTable.tsx'], /deleteLead/)
  assert.match(files['src/generated/components/LeadsTable.tsx'], /updateLead/)
  assert.match(files['src/generated/components/LeadsTable.tsx'], /loading loading-spinner/)
  assert.match(files['src/generated/components/LeadsTable.tsx'], /No records yet/)
  assert.match(files['src/generated/components/LeadsTable.tsx'], /Search records/)
  assert.match(files['src/generated/components/LeadsTable.tsx'], /toggleSort/)
  assert.match(files['src/generated/components/LeadsTable.tsx'], /downloadRows\('csv'\)/)
  assert.match(files['src/generated/components/LeadsTable.tsx'], /Page \{page\} of \{totalPages\}/)
  assert.match(files['src/generated/components/LeadsTable.tsx'], /detailHref/)
  assert.match(files['src/generated/components/LeadsTable.tsx'], /saveEdit/)
  assert.match(files['src/generated/components/LeadsTable.tsx'], /onDelete/)
  assert.match(files['src/generated/components/Metrics.tsx'], /stats/)
  assert.match(files['src/generated/components/Pricing.tsx'], /Starter/)
  assert.match(files['src/generated/components/Chart.tsx'], /role="img"/)
  assert.match(files['src/generated/components/Chart.tsx'], /Qualified/)
})


test('next_shadcn generates CRUD routes, API client, stats and pricing sections', async () => {
  const ast = withCrudActions(await parseIntentFile(demoIntent))
  ast.project = { ...ast.project, target: 'next_shadcn' }
  ast.pages[1].sections[0].row_actions = [{ type: 'detail' }, { type: 'edit' }, { type: 'delete' }]
  ast.pages[0].sections.splice(3, 0,
    { id: 'metrics', type: 'stats', title: 'Proof', items: [{ label: 'Calls', value: '1000+' }] },
    { id: 'pricing', type: 'pricing_cards', title: 'Plans', items: [{ title: 'Starter', price: '$19', features: ['Email support'] }] },
    { id: 'chart', type: 'chart', title: 'Pipeline', items: [{ label: 'Qualified', value: 42 }, { label: 'Closed', value: 12 }] },
  )
  const files = planFiles(buildGraph(ast))
  const pkg = JSON.parse(files['package.json'])

  assert.ok(files['app/api/health/route.ts'])
  assert.ok(files['app/api/metrics/route.ts'])
  assert.ok(files['app/api/telemetry/exceptions/route.ts'])
  assert.match(files['app/api/telemetry/exceptions/route.ts'], /runtime_exception/)
  assert.match(files['app/api/metrics/route.ts'], /requests_total/)
  assert.match(files['middleware.ts'], /X-Request-Id/)
  assert.match(files['middleware.ts'], /X-Correlation-Id/)
  assert.match(files['middleware.ts'], /request_id/)
  assert.match(files['middleware.ts'], /correlation_id/)
  assert.match(files['middleware.ts'], /traceparent/)
  assert.match(files['middleware.ts'], /X-Trace-Id/)
  assert.match(files['middleware.ts'], /trace_id/)
  assert.match(files['middleware.ts'], /import \{ exportSpan, nowNanos \} from '\.\/lib\/otel'/)
  assert.match(files['middleware.ts'], /event\.waitUntil\(exportSpan\(/)
  assert.match(files['lib/otel.ts'], /resourceSpans/)
  assert.match(files['lib/otel.ts'], /OTEL_EXPORTER_OTLP_TRACES_ENDPOINT/)
  assert.match(files['lib/otel.ts'], /OTEL_EXPORTER_OTLP_ENDPOINT/)
  assert.match(files['lib/otel.ts'], /OTEL_EXPORTER_OTLP_HEADERS/)
  assert.match(files['app/error.tsx'], /react_error_boundary/)
  assert.match(files['app/error.tsx'], /\/api\/telemetry\/exceptions/)
  assert.match(files['app/error.tsx'], /reset/)
  assert.match(files['app/layout.tsx'], /<ThemeSwitcher \/>/)
  assert.match(files['app/layout.tsx'], /<ToastHost \/>/)
  assert.match(files['components/generated/ToastHost.tsx'], /intentstack:toast/)
  assert.match(files['components/generated/ThemeSwitcher.tsx'], /intentstack\.theme/)
  assert.match(files['middleware.ts'], /Content-Security-Policy/)
  assert.match(files['middleware.ts'], /object-src 'none'/)
  assert.match(files['middleware.ts'], /base-uri 'self'/)
  assert.match(files['middleware.ts'], /frame-ancestors 'none'/)
  assert.match(files['lib/db/client.ts'], /MIGRATION_MANIFEST/)
  assert.match(files['lib/db/client.ts'], /rollbackIntentStackMigration/)
  assert.match(files['lib/db/client.ts'], /checkIntentStackSchemaDrift/)
  assert.match(files['lib/db/client.ts'], /INTENTSTACK_AUTO_MIGRATE/)
  assert.match(files['lib/db/client.ts'], /export async function checkDatabaseHealth/)
  assert.match(files['lib/db/client.ts'], /export async function closeDatabase/)
  assert.match(files['lib/db/migration_runtime.ts'], /__intentstack_migrations/)
  assert.match(files['lib/db/migration_runtime.ts'], /createHash\('sha256'\)/)
  assert.match(files['lib/db/migration_runtime.ts'], /different checksum/)
  assert.match(files['lib/db/migration_runtime.ts'], /does not match manifest checksum/)
  assert.match(files['lib/db/migration_runtime.ts'], /checkDbMigrationDrift/)
  assert.match(files['lib/db/migration_runtime.ts'], /rollbackDbMigration/)
  assert.match(files['lib/db/migrate.ts'], /runIntentStackMigrations/)
  assert.match(files['lib/db/migrate.ts'], /--rollback/)
  assert.match(files['lib/db/migrate.ts'], /--drift/)
  assert.equal(pkg.scripts.migrate, 'tsx lib/db/migrate.ts')
  assert.equal(pkg.devDependencies.tsx, '^4.19.2')
  assert.equal(pkg.dependencies['@libsql/client'], '^0.14.0')
  assert.equal(pkg.dependencies['drizzle-orm'], '^0.36.4')
  assert.match(files['.env.example'], /INTENTSTACK_AUTO_MIGRATE/)
  assert.match(files['.env.example'], /INTENTSTACK_ROUTE_TIMEOUT_MS/)
  assert.match(files['.env.example'], /OTEL_EXPORTER_OTLP_ENDPOINT/)
  assert.ok(files['migrations/manifest.json'])
  assert.ok(files['migrations/0000_init.down.sql'])
  const manifest = JSON.parse(files['migrations/manifest.json'])
  assert.equal(manifest.driver, 'sqlite')
  assert.equal(manifest.migrations[0].id, '0000_init')
  assert.match(manifest.migrations[0].checksum, /^[a-f0-9]{64}$/)
  assert.equal(manifest.migrations[0].rollback_file, 'migrations/0000_init.down.sql')
  assert.match(manifest.migrations[0].rollback_checksum, /^[a-f0-9]{64}$/)
  assert.ok(files['app/api/leads/[id]/route.ts'])
  assert.ok(files['app/api/leads/stream/route.ts'])
  assert.match(files['lib/route-timeout.ts'], /route_timeout/)
  assert.match(files['app/api/leads/[id]/route.ts'], /withRouteTimeout\('GET', '\/leads\/:id'/)
  assert.match(files['app/api/leads/[id]/route.ts'], /export async function GET/)
  assert.match(files['app/api/leads/[id]/route.ts'], /export async function PUT/)
  assert.match(files['app/api/leads/[id]/route.ts'], /export async function DELETE/)
  assert.match(files['app/api/leads/[id]/route.ts'], /db\.transaction/)
  assert.match(files['app/api/leads/[id]/route.ts'], /tx\.update\(lead\)\.set\(parsed\.data\)/)
  assert.match(files['app/api/leads/stream/route.ts'], /ReadableStream/)
  assert.match(files['lib/api/client.ts'], /export async function getLead/)
  assert.match(files['lib/api/client.ts'], /export async function updateLead/)
  assert.match(files['lib/api/client.ts'], /export async function deleteLead/)
  assert.match(files['lib/api/client.ts'], /export function subscribeLead/)
  assert.match(files['lib/api/client.ts'], /method: 'PUT'/)
  assert.match(files['app/dashboard/leads/[id]/page.tsx'], /<LeadDetail \/>/)
  assert.match(files['components/generated/LeadDetail.tsx'], /getLead/)
  assert.match(files['components/generated/LeadDetail.tsx'], /updateLead/)
  assert.match(files['components/generated/LeadDetail.tsx'], /'use client'/)
  assert.match(files['components/generated/LeadDetail.tsx'], /Loading/)
  assert.match(files['components/generated/LeadForm.tsx'], /status === 'loading'/)
  assert.match(files['components/generated/LeadForm.tsx'], /intentstack:toast/)
  assert.match(files['components/generated/LeadForm.tsx'], /Something went wrong/)
  assert.match(files['components/generated/LeadsTable.tsx'], /deleteLead/)
  assert.match(files['components/generated/LeadsTable.tsx'], /updateLead/)
  assert.match(files['components/generated/LeadsTable.tsx'], /Loading/)
  assert.match(files['components/generated/LeadsTable.tsx'], /No records yet/)
  assert.match(files['components/generated/LeadsTable.tsx'], /Search records/)
  assert.match(files['components/generated/LeadsTable.tsx'], /toggleSort/)
  assert.match(files['components/generated/LeadsTable.tsx'], /downloadRows\('csv'\)/)
  assert.match(files['components/generated/LeadsTable.tsx'], /Page \{page\} of \{totalPages\}/)
  assert.match(files['components/generated/LeadsTable.tsx'], /detailHref/)
  assert.match(files['components/generated/LeadsTable.tsx'], /saveEdit/)
  assert.match(files['components/generated/LeadsTable.tsx'], /onDelete/)
  assert.match(files['components/generated/Metrics.tsx'], /1000/)
  assert.match(files['components/generated/Pricing.tsx'], /Starter/)
  assert.match(files['components/generated/Chart.tsx'], /role="img"/)
  assert.match(files['components/generated/Chart.tsx'], /Qualified/)
})


test('next_shadcn emits only stream route for subscribe-only actions', () => {
  const files = planFiles(buildGraph({
    version: '0.1',
    project: { id: 'realtime_only', target: 'next_shadcn' },
    entities: [{ id: 'Lead', table: 'leads', fields: [{ id: 'name', type: 'string' }] }],
    actions: [{ id: 'subscribe_leads', type: 'subscribe_records', entity: 'Lead' }],
    pages: [{ id: 'home', path: '/', sections: [{ id: 'hero', type: 'hero', title: 'Home' }] }],
  }))
  assert.equal(files['app/api/leads/route.ts'], undefined)
  assert.ok(files['app/api/leads/stream/route.ts'])
  assert.match(files['lib/api/client.ts'], /subscribeLead/)
})

function tenantIntent(target) {
  return {
    version: '0.1',
    project: { id: 'tenant_app', target },
    tenancy: { enabled: true, header: 'X-Org-Id', storage_key: 'tenant.org_id' },
    entities: [{ id: 'Lead', table: 'leads', fields: [{ id: 'name', type: 'string', required: true }] }],
    actions: [
      { id: 'list_leads', type: 'list_records', entity: 'Lead' },
      { id: 'create_lead', type: 'create_record', entity: 'Lead' },
      { id: 'get_lead', type: 'get_record', entity: 'Lead' },
      { id: 'update_lead', type: 'update_record', entity: 'Lead' },
      { id: 'delete_lead', type: 'delete_record', entity: 'Lead' },
      { id: 'subscribe_leads', type: 'subscribe_records', entity: 'Lead' },
    ],
    pages: [{ id: 'home', path: '/', sections: [{ id: 'hero', type: 'hero', title: 'Home' }] }],
  }
}
