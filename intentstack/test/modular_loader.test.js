import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { loadIntentProject } from '../src/intent_loader.js'
import { validate } from '../src/validate.js'
import { buildGraph } from '../src/graph.js'
import { planFiles } from '../src/emit/index.js'

const modularSite = fileURLToPath(new URL('../examples/modular_site', import.meta.url))

test('loader assembles a manifest with included intent modules', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-modular-'))
  try {
    mkdirSync(join(dir, 'intent/shared'), { recursive: true })
    mkdirSync(join(dir, 'intent/frontend/pages'), { recursive: true })
    writeFileSync(join(dir, 'intent/app.intent.yaml'), `version: 0.1
project:
  id: modular_app
  target: web_ts_minimal
includes:
  - shared/*.yaml
  - frontend/pages/*.yaml
`)
    writeFileSync(join(dir, 'intent/shared/navigation.yaml'), `navigation:
  logo: Modular
  items:
    - label: Home
      href: /
`)
    writeFileSync(join(dir, 'intent/frontend/pages/home.yaml'), `page:
  id: home
  path: /
  layout: landing
  sections:
    - id: hero
      type: hero
      title: Modular
      subtitle: Loaded from includes.
`)
    const { ast } = await loadIntentProject(dir, {})
    assert.equal(ast.project.id, 'modular_app')
    assert.equal(ast.navigation.logo, 'Modular')
    assert.equal(ast.pages[0].sections[0].id, 'hero')
    assert.equal(validate(ast).hasErrors(), false)
    const files = planFiles(buildGraph(ast))
    assert.match(files['src/generated/pages/HomePage.tsx'], /<AppNav \/>/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('loader resolves frontend page and section modules by ref', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-frontend-modules-'))
  try {
    mkdirSync(join(dir, 'intent/frontend/pages'), { recursive: true })
    mkdirSync(join(dir, 'intent/frontend/sections/home'), { recursive: true })
    mkdirSync(join(dir, 'intent/frontend/sections/docs'), { recursive: true })
    writeFileSync(join(dir, 'intent/app.intent.yaml'), `version: 0.1
project:
  id: frontend_modules
  target: web_ts_minimal
includes:
  - frontend/pages/*.yaml
  - frontend/sections/**/*.yaml
`)
    writeFileSync(join(dir, 'intent/frontend/pages/home.yaml'), `page:
  id: home
  path: /
  layout: landing
  sections:
    - ref: hero
    - ref: features
`)
    writeFileSync(join(dir, 'intent/frontend/pages/docs.yaml'), `page:
  id: docs
  path: /docs
  layout: docs
  sections:
    - ref: docs_content
`)
    writeFileSync(join(dir, 'intent/frontend/sections/home/hero.yaml'), `section:
  id: hero
  type: hero
  title: Frontend modules
  subtitle: Pages reference sections by id.
`)
    writeFileSync(join(dir, 'intent/frontend/sections/home/features.yaml'), `section:
  id: features
  type: card_grid
  title: Features
  items:
    - title: Page refs
      text: Pages stay small.
`)
    writeFileSync(join(dir, 'intent/frontend/sections/docs/content.yaml'), `section:
  id: docs_content
  type: content
  title: Docs
  blocks:
    - id: intro
      type: paragraph
      text: Section modules compile into generated components.
`)

    const { ast } = await loadIntentProject(dir, {})
    assert.equal(ast.__intentstack.modular, true)
    assert.equal(ast.pages.length, 2)
    const home = ast.pages.find((page) => page.id === 'home')
    assert.deepEqual(home.sections.map((section) => section.id), ['hero', 'features'])
    assert.match(ast.__intentstack.owners.pages.home.file, /frontend[\\/]pages[\\/]home\.yaml$/)
    assert.match(ast.__intentstack.owners.sections.hero.file, /frontend[\\/]sections[\\/]home[\\/]hero\.yaml$/)
    assert.equal(validate(ast).hasErrors(), false)

    const webFiles = planFiles(buildGraph(ast))
    assert.match(webFiles['src/generated/pages/HomePage.tsx'], /<Hero \/>/)
    assert.match(webFiles['src/generated/pages/DocsPage.tsx'], /<DocsContent \/>/)

    const nextAst = JSON.parse(JSON.stringify(ast))
    nextAst.project.target = 'next_shadcn'
    assert.equal(validate(nextAst).hasErrors(), false)
    const nextFiles = planFiles(buildGraph(nextAst))
    assert.match(nextFiles['app/page.tsx'], /<Hero \/>/)
    assert.match(nextFiles['app/docs/page.tsx'], /<DocsContent \/>/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('loader assembles backend entity and action modules into generated APIs', async () => {
  const { ast } = await loadIntentProject(modularSite, {})
  const metadata = ast.__intentstack

  assert.equal(metadata.modular, true)
  assert.equal(ast.entities.length, 1)
  assert.equal(ast.entities[0].id, 'Lead')
  assert.deepEqual(ast.actions.map((action) => action.type).sort(), [
    'create_record',
    'delete_record',
    'list_records',
    'update_record',
  ])
  assert.match(metadata.owners.entities.Lead.file, /backend[\\/]entities[\\/]lead\.entity\.yaml$/)
  assert.match(metadata.owners.actions.create_lead.file, /backend[\\/]actions[\\/]lead\.actions\.yaml$/)
  assert.equal(validate(ast).hasErrors(), false)

  const webFiles = planFiles(buildGraph(ast))
  assert.match(webFiles['server/generated/routes/lead.ts'], /r\.post\('\/leads'/)
  assert.match(webFiles['server/generated/routes/lead.ts'], /r\.put\('\/leads\/:id'/)
  assert.match(webFiles['src/generated/api/client.ts'], /export async function createLead/)
  assert.match(webFiles['src/generated/api/client.ts'], /export async function listLead/)
  assert.match(webFiles['src/generated/components/LeadForm.tsx'], /createLead/)
  assert.match(webFiles['src/generated/components/LeadsTable.tsx'], /listLead/)

  const nextAst = JSON.parse(JSON.stringify(ast))
  nextAst.project.target = 'next_shadcn'
  assert.equal(validate(nextAst).hasErrors(), false)
  const nextFiles = planFiles(buildGraph(nextAst))
  assert.match(nextFiles['app/api/leads/route.ts'], /export async function POST/)
  assert.match(nextFiles['app/api/leads/[id]/route.ts'], /export async function PUT/)
  assert.match(nextFiles['lib/api/client.ts'], /export async function createLead/)
  assert.match(nextFiles['components/generated/LeadForm.tsx'], /createLead/)
})
