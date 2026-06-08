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


test('postgres database driver emits pg schema, client, migrations and deps', () => {
  const files = planFiles(buildGraph({
    version: '0.1',
    project: { id: 'pg_app', target: 'web_ts_minimal', database: { driver: 'postgres' } },
    entities: [{ id: 'Lead', table: 'leads', fields: [{ id: 'name', type: 'string', required: true }, { id: 'score', type: 'number' }] }],
    actions: [{ id: 'list_leads', type: 'list_records', entity: 'Lead' }],
    pages: [{ id: 'home', path: '/', sections: [{ id: 'hero', type: 'hero', title: 'Home' }] }],
  }))
  const pkg = JSON.parse(files['package.json'])
  assert.equal(pkg.dependencies.postgres, '^3.4.5')
  assert.equal(pkg.dependencies['drizzle-orm'], '^0.36.4')
  assert.match(files['server/generated/db/schema.ts'], /pgTable/)
  assert.match(files['server/generated/db/schema.ts'], /serial\('id'\)\.primaryKey\(\)/)
  assert.match(files['server/generated/db/schema.ts'], /doublePrecision\('score'\)/)
  assert.match(files['server/generated/db/client.ts'], /drizzle-orm\/postgres-js/)
  assert.match(files['server/generated/db/client.ts'], /postgres\(url, \{ max: 1 \}\)/)
  assert.match(files['server/generated/db/migration_runtime.ts'], /client\.unsafe\(statement\)/)
  assert.match(files['server/generated/db/migration_runtime.ts'], /rollbackDbMigration/)
  assert.match(files['server/generated/db/migration_runtime.ts'], /checkDbMigrationDrift/)
  assert.match(files['migrations/0000_init.sql'], /id serial PRIMARY KEY/)
  assert.match(files['migrations/0000_init.sql'], /score double precision/)
  assert.match(files['migrations/0000_init.down.sql'], /DROP TABLE IF EXISTS leads/)
  assert.match(files['.env.example'], /DATABASE_URL=postgres/)
  const manifest = JSON.parse(files['migrations/manifest.json'])
  assert.equal(manifest.driver, 'postgres')
  assert.equal(manifest.migrations[0].rollback_file, 'migrations/0000_init.down.sql')
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
  assert.match(webFiles['src/generated/components/AppNav.tsx'], /aria-label="Primary navigation"/)
  assert.match(webFiles['src/generated/components/AppNav.tsx'], /focus-visible:ring/)
  assert.match(webFiles['src/generated/pages/HomePage.tsx'], /<AppNav \/>/)
  assert.match(webFiles['src/generated/pages/DocsPage.tsx'], /<AppNav \/>/)
  assert.match(webFiles['src/generated/components/DocsContent.tsx'], /On this page/)
  assert.match(webFiles['src/generated/components/DocsContent.tsx'], /intentstack build/)
  assert.match(webFiles['src/generated/components/DocsContent.tsx'], /language-bash/)
  assert.match(webFiles['src/generated/components/DocsContent.tsx'], /data-language="yaml"/)
  assert.match(webFiles['src/generated/components/DocsContent.tsx'], /data-intent-section-type="content"/)
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
  assert.match(nextFiles['components/generated/AppNav.tsx'], /aria-label="Primary navigation"/)
  assert.match(nextFiles['components/generated/AppNav.tsx'], /focus-visible:ring/)
  assert.match(nextFiles['app/page.tsx'], /<AppNav \/>/)
  assert.match(nextFiles['app/docs/page.tsx'], /<AppNav \/>/)
  assert.match(nextFiles['components/generated/DocsContent.tsx'], /On this page/)
  assert.match(nextFiles['components/generated/DocsContent.tsx'], /intentstack build/)
  assert.match(nextFiles['components/generated/DocsContent.tsx'], /language-bash/)
  assert.match(nextFiles['components/generated/DocsContent.tsx'], /data-language="yaml"/)
  assert.match(nextFiles['components/generated/DocsContent.tsx'], /data-intent-section-type="content"/)
  assert.match(nextFiles['components/generated/DocsContent.tsx'], /Open docs/)
  assert.match(nextFiles['components/generated/DocsContent.tsx'], /<table/)
  assert.match(nextFiles['components/generated/DocsContent.tsx'], /import \{ PreviewCards \} from '\.\/PreviewCards'/)
  assert.match(nextFiles['components/generated/DocsContent.tsx'], /<PreviewCards \/>/)
  assert.doesNotMatch(nextFiles['app/docs/page.tsx'], /<PreviewCards \/>/)
})
