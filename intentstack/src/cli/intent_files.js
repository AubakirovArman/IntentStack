import { dirname, join, resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { normalize } from '../normalize.js'
import { validate } from '../validate.js'
import { loadAst } from './context.js'

export async function runSplit(ctx, projectDir, cfg) {
  const { intentPath, ast } = await loadAst(ctx, projectDir, cfg)
  const coreAst = normalize(ast)
  const outIntentDir = resolve(projectDir, ctx.flag('out-intent-dir', 'intent'))
  const d = validate(coreAst, { projectDir, outDir: resolve(projectDir, ctx.flag('out', cfg.out || 'app')) })
  if (d.hasErrors()) {
    console.log(d.format())
    console.error('\nx split aborted - source intent is invalid.')
    process.exit(1)
  }
  const files = splitIntentFiles(ast)
  console.log(`\nIntentStack split - ${intentPath}`)
  console.log(`Output intent dir: ${outIntentDir}\n`)
  console.log('Module files:')
  for (const file of Object.keys(files).sort()) console.log(`  + ${file}`)
  if (ctx.has('--write')) {
    await writeSplitFiles(outIntentDir, files)
    console.log(`\nok split written (${Object.keys(files).length} files).`)
  } else {
    console.log('\n(dry run - add --write to persist)')
  }
}

export function splitIntentFiles(ast) {
  const files = {}
  files['app.intent.yaml'] = {
    version: ast.version ?? 0.1,
    project: clone(ast.project || {}),
    includes: [
      'shared/*.yaml',
      'backend/entities/*.yaml',
      'backend/actions/*.yaml',
      'backend/workflows/*.yaml',
      'backend/integrations/*.yaml',
      'frontend/pages/*.yaml',
      'frontend/sections/**/*.yaml',
    ],
  }
  if (ast.theme) files['shared/theme.yaml'] = { theme: clone(ast.theme) }
  if (ast.navigation) files['shared/navigation.yaml'] = { navigation: clone(ast.navigation) }
  if (ast.auth) files['shared/auth.yaml'] = { auth: clone(ast.auth) }

  for (const entity of ast.entities || []) {
    if (entity?.id) files[`backend/entities/${kebab(entity.id)}.entity.yaml`] = { entity: clone(entity) }
  }
  for (const action of ast.actions || []) {
    if (action?.id) files[`backend/actions/${kebab(action.id)}.action.yaml`] = { action: clone(action) }
  }
  for (const workflow of ast.workflows || []) {
    if (workflow?.id) files[`backend/workflows/${kebab(workflow.id)}.workflow.yaml`] = { workflow: clone(workflow) }
  }
  for (const integration of ast.integrations || []) {
    if (integration?.id) files[`backend/integrations/${kebab(integration.id)}.integration.yaml`] = { integration: clone(integration) }
  }

  for (const page of ast.pages || []) {
    if (!page?.id) continue
    const pageId = kebab(page.id)
    const pageDoc = clone(page)
    pageDoc.sections = (page.sections || []).map((section) => ({ ref: section.id }))
    files[`frontend/pages/${pageId}.page.yaml`] = { page: pageDoc }
    for (const section of page.sections || []) {
      if (section?.id) files[`frontend/sections/${pageId}/${kebab(section.id)}.section.yaml`] = { section: clone(section) }
    }
  }
  return files
}

export async function writeSplitFiles(outIntentDir, files) {
  const mod = await import('js-yaml')
  const YAML = mod.default ?? mod
  for (const [rel, doc] of Object.entries(files)) {
    const file = join(outIntentDir, ...rel.split('/'))
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, YAML.dump(doc, { lineWidth: 100, noRefs: true }))
  }
}

function kebab(value) {
  return String(value).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'module'
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}
