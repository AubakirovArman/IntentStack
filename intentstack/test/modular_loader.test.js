import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadIntentProject } from '../src/intent_loader.js'
import { validate } from '../src/validate.js'
import { buildGraph } from '../src/graph.js'
import { planFiles } from '../src/emit/index.js'

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
