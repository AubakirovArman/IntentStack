import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { parseIntentFile } from '../src/parse.js'
import { buildGraph } from '../src/graph.js'
import { planFiles } from '../src/emit/index.js'
import { validate } from '../src/validate.js'

const dashboardIntent = fileURLToPath(new URL('../examples/dashboard_crud/intent/app.intent.yaml', import.meta.url))
const docsIntent = fileURLToPath(new URL('../examples/docs_content/intent/app.intent.yaml', import.meta.url))

test('dashboard CRUD example covers realistic form and table controls', async () => {
  const ast = await parseIntentFile(dashboardIntent)
  assert.equal(validate(ast).hasErrors(), false)
  const lead = ast.entities.find((entity) => entity.id === 'Lead')
  assert.ok(lead.fields.some((field) => field.type === 'text'))
  assert.ok(lead.fields.some((field) => field.type === 'boolean'))
  assert.ok(lead.fields.some((field) => field.type === 'datetime'))
  const table = ast.pages.find((page) => page.id === 'dashboard_leads').sections[0]
  assert.ok(table.seed.length >= 2)
  assert.deepEqual(table.filters, ['status', 'source'])
  const files = planFiles(buildGraph(ast))
  assert.match(files['src/generated/components/LeadForm.tsx'], /textarea/)
  assert.match(files['src/generated/components/LeadForm.tsx'], /checkbox/)
  assert.match(files['src/generated/components/LeadForm.tsx'], /datetime-local/)
  assert.match(files['src/generated/components/LeadsTable.tsx'], /Search records/)
})

test('docs content example keeps previews and patch code in integrated blocks', async () => {
  const ast = await parseIntentFile(docsIntent)
  assert.equal(validate(ast).hasErrors(), false)
  const docs = ast.pages.find((page) => page.id === 'docs')
  const content = docs.sections.find((section) => section.id === 'docs_content')
  const examples = content.blocks.filter((block) => block.type === 'example')
  assert.equal(examples.length, 3)
  assert.ok(docs.sections.filter((section) => section.embed_only).length >= 3)
  const files = planFiles(buildGraph(ast))
  assert.match(files['src/generated/components/DocsContent.tsx'], /Card grid live preview/)
  assert.match(files['src/generated/components/DocsContent.tsx'], /<PreviewMetrics \/>/)
  assert.match(files['src/generated/components/DocsContent.tsx'], /Live patch flow/)
})
