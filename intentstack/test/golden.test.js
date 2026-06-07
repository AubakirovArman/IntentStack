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
  )
  const files = planFiles(buildGraph(ast))

  assert.match(files['server/index.ts'], /app\.get\('\/api\/health'/)
  assert.match(files['server/index.ts'], /app\.get\('\/api\/metrics'/)
  assert.match(files['server/index.ts'], /requests_total/)
  assert.match(files['server/generated/db/client.ts'], /__intentstack_migrations/)
  assert.match(files['server/generated/db/client.ts'], /createHash\('sha256'\)/)
  assert.match(files['server/generated/db/client.ts'], /different checksum/)
  assert.match(files['server/generated/routes/lead.ts'], /r\.get\('\/leads\/:id'/)
  assert.match(files['server/generated/routes/lead.ts'], /r\.put\('\/leads\/:id'/)
  assert.match(files['server/generated/routes/lead.ts'], /r\.delete\('\/leads\/:id'/)
  assert.match(files['server/generated/routes/lead.ts'], /r\.get\('\/leads\/stream'/)
  assert.match(files['server/generated/routes/lead.ts'], /streamSSE/)
  assert.match(files['server/generated/routes/lead.ts'], /db\.update\(lead\)\.set\(parsed\.data\)/)
  assert.match(files['src/generated/api/client.ts'], /export async function getLead/)
  assert.match(files['src/generated/api/client.ts'], /export async function updateLead/)
  assert.match(files['src/generated/api/client.ts'], /export async function deleteLead/)
  assert.match(files['src/generated/api/client.ts'], /export function subscribeLead/)
  assert.match(files['src/generated/api/client.ts'], /method: 'PUT'/)
  assert.match(files['src/generated/pages/DashboardLeadDetailPage.tsx'], /<LeadDetail \/>/)
  assert.match(files['src/generated/components/LeadDetail.tsx'], /getLead/)
  assert.match(files['src/generated/components/LeadDetail.tsx'], /updateLead/)
  assert.match(files['src/generated/components/LeadsTable.tsx'], /deleteLead/)
  assert.match(files['src/generated/components/LeadsTable.tsx'], /updateLead/)
  assert.match(files['src/generated/components/LeadsTable.tsx'], /detailHref/)
  assert.match(files['src/generated/components/LeadsTable.tsx'], /saveEdit/)
  assert.match(files['src/generated/components/LeadsTable.tsx'], /onDelete/)
  assert.match(files['src/generated/components/Metrics.tsx'], /stats/)
  assert.match(files['src/generated/components/Pricing.tsx'], /Starter/)
})

test('next_shadcn generates CRUD routes, API client, stats and pricing sections', async () => {
  const ast = withCrudActions(await parseIntentFile(demoIntent))
  ast.project = { ...ast.project, target: 'next_shadcn' }
  ast.pages[1].sections[0].row_actions = [{ type: 'detail' }, { type: 'edit' }, { type: 'delete' }]
  ast.pages[0].sections.splice(3, 0,
    { id: 'metrics', type: 'stats', title: 'Proof', items: [{ label: 'Calls', value: '1000+' }] },
    { id: 'pricing', type: 'pricing_cards', title: 'Plans', items: [{ title: 'Starter', price: '$19', features: ['Email support'] }] },
  )
  const files = planFiles(buildGraph(ast))

  assert.ok(files['app/api/health/route.ts'])
  assert.ok(files['app/api/metrics/route.ts'])
  assert.match(files['app/api/metrics/route.ts'], /requests_total/)
  assert.match(files['lib/db/client.ts'], /__intentstack_migrations/)
  assert.match(files['lib/db/client.ts'], /createHash\('sha256'\)/)
  assert.match(files['lib/db/client.ts'], /different checksum/)
  assert.ok(files['app/api/leads/[id]/route.ts'])
  assert.ok(files['app/api/leads/stream/route.ts'])
  assert.match(files['app/api/leads/[id]/route.ts'], /export async function GET/)
  assert.match(files['app/api/leads/[id]/route.ts'], /export async function PUT/)
  assert.match(files['app/api/leads/[id]/route.ts'], /export async function DELETE/)
  assert.match(files['app/api/leads/[id]/route.ts'], /db\.update\(lead\)\.set\(parsed\.data\)/)
  assert.match(files['app/api/leads/stream/route.ts'], /ReadableStream/)
  assert.match(files['lib/api/client.ts'], /export async function getLead/)
  assert.match(files['lib/api/client.ts'], /export async function updateLead/)
  assert.match(files['lib/api/client.ts'], /export async function deleteLead/)
  assert.match(files['lib/api/client.ts'], /export function subscribeLead/)
  assert.match(files['lib/api/client.ts'], /method: 'PUT'/)
  assert.match(files['app/dashboard/leads/[id]/page.tsx'], /<LeadDetail \/>/)
  assert.match(files['components/generated/LeadDetail.tsx'], /getLead/)
  assert.match(files['components/generated/LeadDetail.tsx'], /updateLead/)
  assert.match(files['components/generated/LeadsTable.tsx'], /deleteLead/)
  assert.match(files['components/generated/LeadsTable.tsx'], /updateLead/)
  assert.match(files['components/generated/LeadsTable.tsx'], /detailHref/)
  assert.match(files['components/generated/LeadsTable.tsx'], /saveEdit/)
  assert.match(files['components/generated/LeadsTable.tsx'], /onDelete/)
  assert.match(files['components/generated/Metrics.tsx'], /1000/)
  assert.match(files['components/generated/Pricing.tsx'], /Starter/)
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

test('multi-tenant apps scope generated schema, APIs and clients for both targets', () => {
  const webFiles = planFiles(buildGraph(tenantIntent('web_ts_minimal')))
  assert.match(webFiles['server/generated/db/schema.ts'], /tenantId: text\('tenant_id'\)\.notNull\(\)/)
  assert.match(webFiles['migrations/0000_init.sql'], /tenant_id text NOT NULL/)
  assert.match(webFiles['server/generated/routes/lead.ts'], /tenant_required/)
  assert.match(webFiles['server/generated/routes/lead.ts'], /header: "X-Org-Id"/)
  assert.match(webFiles['server/generated/routes/lead.ts'], /where\(eq\(lead\.tenantId, tenant\)\)/)
  assert.match(webFiles['server/generated/routes/lead.ts'], /and\(eq\(lead\.id, id\), eq\(lead\.tenantId, tenant\)\)/)
  assert.match(webFiles['server/generated/routes/lead.ts'], /tenantId: tenant/)
  assert.match(webFiles['src/generated/api/client.ts'], /window\.localStorage\.getItem\("tenant\.org_id"\)/)
  assert.match(webFiles['src/generated/api/client.ts'], /"X-Org-Id": tenant/)
  assert.match(webFiles['src/generated/api/client.ts'], /tenant_id=/)

  const nextFiles = planFiles(buildGraph(tenantIntent('next_shadcn')))
  assert.match(nextFiles['lib/db/schema.ts'], /tenantId: text\('tenant_id'\)\.notNull\(\)/)
  assert.match(nextFiles['migrations/0000_init.sql'], /tenant_id text NOT NULL/)
  assert.match(nextFiles['app/api/leads/route.ts'], /tenant_required/)
  assert.match(nextFiles['app/api/leads/route.ts'], /req\.headers\.get\("X-Org-Id"\)/)
  assert.match(nextFiles['app/api/leads/route.ts'], /where\(eq\(lead\.tenantId, tenant\)\)/)
  assert.match(nextFiles['app/api/leads/route.ts'], /tenantId: tenant/)
  assert.match(nextFiles['app/api/leads/[id]/route.ts'], /and\(eq\(lead\.id, Number\(params\.id\)\), eq\(lead\.tenantId, tenant\)\)/)
  assert.match(nextFiles['app/api/leads/stream/route.ts'], /where\(eq\(lead\.tenantId, tenant\)\)/)
  assert.match(nextFiles['lib/api/client.ts'], /window\.localStorage\.getItem\("tenant\.org_id"\)/)
  assert.match(nextFiles['lib/api/client.ts'], /"X-Org-Id": tenant/)
  assert.match(nextFiles['lib/api/client.ts'], /tenant_id=/)
})

function docsIntent(target) {
  return {
    version: '0.1',
    project: { id: 'docs_app', name: 'Docs App', target },
    navigation: {
      logo: 'Docs App',
      items: [
        { label: 'Home', href: '/' },
        { label: 'Docs', href: '/docs' },
      ],
    },
    pages: [
      {
        id: 'home',
        path: '/',
        layout: 'landing',
        sections: [
          { id: 'hero', type: 'hero', title: 'Docs App', subtitle: 'Generated with shared navigation.' },
        ],
      },
      {
        id: 'docs',
        path: '/docs',
        layout: 'docs',
        sections: [
          {
            id: 'docs_content',
            type: 'content',
            title: 'Documentation',
            blocks: [
              { id: 'overview', type: 'heading', level: 2, text: 'Overview' },
              { id: 'workflow', type: 'heading', level: 2, text: 'Workflow' },
              { id: 'intro', type: 'paragraph', text: 'Use patches to edit the app.' },
              { id: 'steps', type: 'list', items: ['Patch', 'Check', 'Build'] },
              { id: 'tip', type: 'callout', title: 'Tip', text: 'Keep changes small.' },
              { id: 'link', type: 'link', text: 'Open docs', href: '/docs' },
              { id: 'matrix', type: 'table', columns: ['Step', 'Command'], rows: [['Build', 'intentstack build']] },
              {
                id: 'cards_example',
                type: 'example',
                title: 'Card grid example',
                text: 'Generated preview and patch code are kept in the same docs block.',
                section: 'preview_cards',
                language: 'yaml',
                code: 'patch:\n  - op: section.add\n    page: docs\n    section:\n      id: preview_cards\n      type: card_grid',
              },
              { id: 'command', type: 'code', language: 'bash', code: 'intentstack build' },
            ],
          },
          {
            id: 'preview_cards',
            type: 'card_grid',
            title: 'Live cards',
            embed_only: true,
            items: [{ title: 'One block', text: 'Preview generated inside docs content.' }],
          },
        ],
      },
    ],
  }
}

test('global navigation and content sections generate for both targets', () => {
  const webAst = docsIntent('web_ts_minimal')
  assert.equal(validate(webAst).hasErrors(), false)
  const webFiles = planFiles(buildGraph(webAst))
  assert.match(webFiles['src/generated/components/AppNav.tsx'], /Docs App/)
  assert.match(webFiles['src/generated/pages/HomePage.tsx'], /<AppNav \/>/)
  assert.match(webFiles['src/generated/pages/DocsPage.tsx'], /<AppNav \/>/)
  assert.match(webFiles['src/generated/components/DocsContent.tsx'], /On this page/)
  assert.match(webFiles['src/generated/components/DocsContent.tsx'], /intentstack build/)
  assert.match(webFiles['src/generated/components/DocsContent.tsx'], /Open docs/)
  assert.match(webFiles['src/generated/components/DocsContent.tsx'], /<table/)
  assert.match(webFiles['src/generated/components/DocsContent.tsx'], /import \{ PreviewCards \} from '\.\/PreviewCards'/)
  assert.match(webFiles['src/generated/components/DocsContent.tsx'], /<PreviewCards \/>/)
  assert.doesNotMatch(webFiles['src/generated/pages/DocsPage.tsx'], /<PreviewCards \/>/)
  assert.match(webFiles['src/routes.tsx'], /path="\/docs"/)

  const nextAst = docsIntent('next_shadcn')
  assert.equal(validate(nextAst).hasErrors(), false)
  const nextFiles = planFiles(buildGraph(nextAst))
  assert.match(nextFiles['components/generated/AppNav.tsx'], /Docs App/)
  assert.match(nextFiles['app/page.tsx'], /<AppNav \/>/)
  assert.match(nextFiles['app/docs/page.tsx'], /<AppNav \/>/)
  assert.match(nextFiles['components/generated/DocsContent.tsx'], /On this page/)
  assert.match(nextFiles['components/generated/DocsContent.tsx'], /intentstack build/)
  assert.match(nextFiles['components/generated/DocsContent.tsx'], /Open docs/)
  assert.match(nextFiles['components/generated/DocsContent.tsx'], /<table/)
  assert.match(nextFiles['components/generated/DocsContent.tsx'], /import \{ PreviewCards \} from '\.\/PreviewCards'/)
  assert.match(nextFiles['components/generated/DocsContent.tsx'], /<PreviewCards \/>/)
  assert.doesNotMatch(nextFiles['app/docs/page.tsx'], /<PreviewCards \/>/)
})
