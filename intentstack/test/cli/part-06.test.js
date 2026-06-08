import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('../src/index.js', import.meta.url))
const root = fileURLToPath(new URL('../../', import.meta.url))

function run(args, options = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
    ...options,
  })
}

test('apply --write preserves modular intent files and writes owners', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-modular-apply-'))
  try {
    mkdirSync(join(dir, 'intent/shared'), { recursive: true })
    mkdirSync(join(dir, 'intent/frontend/pages'), { recursive: true })
    mkdirSync(join(dir, 'intent/frontend/sections/docs'), { recursive: true })
    writeFileSync(join(dir, 'intent/app.intent.yaml'), `version: 0.1
project:
  id: modular_apply
  target: web_ts_minimal
includes:
  - shared/*.yaml
  - frontend/pages/*.yaml
  - frontend/sections/**/*.yaml
`)
    writeFileSync(join(dir, 'intent/shared/navigation.yaml'), `navigation:
  logo: Modular Apply
  items:
    - label: Home
      href: /
`)
    writeFileSync(join(dir, 'intent/frontend/pages/docs.yaml'), `page:
  id: docs
  path: /docs
  layout: docs
  sections:
    - ref: docs_content
    - ref: docs_cards
`)
    writeFileSync(join(dir, 'intent/frontend/sections/docs/content.yaml'), `section:
  id: docs_content
  type: content
  title: Docs
  blocks:
    - id: intro
      type: paragraph
      text: Before
`)
    writeFileSync(join(dir, 'intent/frontend/sections/docs/cards.yaml'), `section:
  id: docs_cards
  type: card_grid
  embed_only: true
  items:
    - title: One card
      text: Embedded preview.
`)
    const patch = join(dir, 'update.patch.yaml')
    writeFileSync(patch, `patch:
  - op: navigation.item.add
    item:
      label: Docs
      href: /docs
  - op: content.block.update
    section: docs_content
    block: intro
    value:
      text: After
  - op: content.example.add
    section: docs_content
    id: cards_example
    title: Cards
    preview_section: docs_cards
    code: |
      version: 0.1
      patch: []
`)

    const applied = run(['apply', patch, '--project', dir, '--write'])
    assert.equal(applied.status, 0, applied.stderr)
    assert.match(applied.stdout, /modules updated:/)

    const rootIntent = readFileSync(join(dir, 'intent/app.intent.yaml'), 'utf8')
    const navigation = readFileSync(join(dir, 'intent/shared/navigation.yaml'), 'utf8')
    const section = readFileSync(join(dir, 'intent/frontend/sections/docs/content.yaml'), 'utf8')
    assert.match(rootIntent, /includes:/)
    assert.doesNotMatch(rootIntent, /^pages:/m)
    assert.match(navigation, /label: Docs/)
    assert.match(section, /text: After/)
    assert.match(section, /type: example/)
    assert.match(section, /section: docs_cards/)

    const checked = run(['check', '--project', dir])
    assert.equal(checked.status, 0, checked.stderr)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})


test('section.module.add creates a section module and page ref', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-section-module-'))
  try {
    const created = run(['new', dir, '--name', 'Section Module App'])
    assert.equal(created.status, 0, created.stderr)
    const patch = join(dir, 'add-section.patch.yaml')
    writeFileSync(patch, `patch:
  - op: section.module.add
    page: home
    after: hero
    section:
      id: docs_teaser
      type: card_grid
      title: Docs teaser
      items:
        - title: Module file
          text: This section is written as its own file.
`)

    const applied = run(['apply', patch, '--project', dir, '--write'])
    assert.equal(applied.status, 0, applied.stderr)
    assert.match(applied.stdout, /section module docs_teaser/)

    const page = readFileSync(join(dir, 'intent/frontend/pages/home.page.yaml'), 'utf8')
    const sectionPath = join(dir, 'intent/frontend/sections/home/docs-teaser.section.yaml')
    const section = readFileSync(sectionPath, 'utf8')
    assert.match(page, /ref: docs_teaser/)
    assert.doesNotMatch(page, /type: card_grid/)
    assert.match(section, /id: docs_teaser/)
    assert.match(section, /type: card_grid/)

    const checked = run(['check', '--project', dir])
    assert.equal(checked.status, 0, checked.stderr)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('apply --file-diff shows semantic and generated output changes without writing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-apply-file-diff-'))
  try {
    const created = run(['new', dir, '--name', 'File Diff App'])
    assert.equal(created.status, 0, created.stderr)
    const patch = join(dir, 'update.patch.yaml')
    writeFileSync(patch, `patch:
  - op: project.set_name
    name: File Diff Renamed
`)

    const applied = run(['apply', patch, '--project', dir, '--file-diff'])
    assert.equal(applied.status, 0, applied.stderr)
    assert.match(applied.stdout, /Semantic diff:/)
    assert.match(applied.stdout, /Generated file diff:/)
    assert.match(applied.stdout, /README\.md/)
    assert.match(applied.stdout, /index\.html/)
    assert.match(applied.stdout, /Summary: 0 add, 2 change/)
    assert.match(applied.stdout, /\(dry run/)

    const intent = readFileSync(join(dir, 'intent/app.intent.yaml'), 'utf8')
    assert.match(intent, /name: File Diff App/)
    assert.doesNotMatch(intent, /File Diff Renamed/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
