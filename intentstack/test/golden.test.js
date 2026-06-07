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

  assert.match(files['server/generated/routes/lead.ts'], /r\.get\('\/leads\/:id'/)
  assert.match(files['server/generated/routes/lead.ts'], /r\.put\('\/leads\/:id'/)
  assert.match(files['server/generated/routes/lead.ts'], /r\.delete\('\/leads\/:id'/)
  assert.match(files['server/generated/routes/lead.ts'], /db\.update\(lead\)\.set\(parsed\.data\)/)
  assert.match(files['src/generated/api/client.ts'], /export async function getLead/)
  assert.match(files['src/generated/api/client.ts'], /export async function updateLead/)
  assert.match(files['src/generated/api/client.ts'], /export async function deleteLead/)
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

  assert.ok(files['app/api/leads/[id]/route.ts'])
  assert.match(files['app/api/leads/[id]/route.ts'], /export async function GET/)
  assert.match(files['app/api/leads/[id]/route.ts'], /export async function PUT/)
  assert.match(files['app/api/leads/[id]/route.ts'], /export async function DELETE/)
  assert.match(files['app/api/leads/[id]/route.ts'], /db\.update\(lead\)\.set\(parsed\.data\)/)
  assert.match(files['lib/api/client.ts'], /export async function getLead/)
  assert.match(files['lib/api/client.ts'], /export async function updateLead/)
  assert.match(files['lib/api/client.ts'], /export async function deleteLead/)
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
              { id: 'command', type: 'code', language: 'bash', code: 'intentstack build' },
            ],
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
  assert.match(webFiles['src/routes.tsx'], /path="\/docs"/)

  const nextAst = docsIntent('next_shadcn')
  assert.equal(validate(nextAst).hasErrors(), false)
  const nextFiles = planFiles(buildGraph(nextAst))
  assert.match(nextFiles['components/generated/AppNav.tsx'], /Docs App/)
  assert.match(nextFiles['app/page.tsx'], /<AppNav \/>/)
  assert.match(nextFiles['app/docs/page.tsx'], /<AppNav \/>/)
  assert.match(nextFiles['components/generated/DocsContent.tsx'], /On this page/)
  assert.match(nextFiles['components/generated/DocsContent.tsx'], /intentstack build/)
})
