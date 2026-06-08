import { dirname, resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { generateDocsSite } from '../docs_site.js'
import { writeIntentProject } from '../intent_loader.js'
import { installMarketplacePlugin } from '../marketplace.js'
import { DOMAIN_MODULES } from '../modules.js'
import { normalize } from '../normalize.js'
import { TARGETS } from '../registry.js'
import { getThemePack, listThemePacks } from '../themes.js'
import { validate } from '../validate.js'
import { loadAst } from './context.js'

export function runDocs(ctx, projectDir) {
  const outDir = resolve(ctx.flag('out', 'docs-site'))
  const files = generateDocsSite(projectDir, outDir)
  console.log(`ok docs site written -> ${outDir}`)
  console.log(`   pages: ${files.join(', ')}`)
}

export async function runThemes(ctx, projectDir, cfg) {
  const apply = ctx.flag('apply', ctx.flag('preset', (ctx.args[1] && !ctx.args[1].startsWith('--')) ? ctx.args[1] : null))
  if (!apply) {
    const packs = listThemePacks()
    if (ctx.has('--json')) console.log(JSON.stringify({ themes: packs }, null, 2))
    else {
      console.log('Theme packs:')
      for (const pack of packs) console.log(`  ${pack.id}: ${pack.label} - ${pack.description}`)
    }
    return
  }
  const pack = getThemePack(apply)
  if (!pack) {
    console.error(`Unknown theme pack "${apply}". Available: ${listThemePacks().map((item) => item.id).join(', ')}`)
    process.exit(2)
  }
  const { intentPath, ast } = await loadAst(ctx, projectDir, cfg)
  const before = ast.theme || {}
  ast.theme = { ...pack.theme }
  const coreAst = normalize(ast)
  const d = validate(coreAst, { projectDir, outDir: resolve(projectDir, cfg.out || 'app') })
  console.log(`\nIntentStack themes - ${intentPath}`)
  console.log(`Apply: ${pack.id} (${pack.label})`)
  console.log(`old: ${JSON.stringify(before)}`)
  console.log(`new: ${JSON.stringify(ast.theme)}`)
  console.log('\nValidation:')
  console.log(d.format())
  if (d.hasErrors()) {
    console.error(`\nx theme pack would introduce ${d.errors.length} error(s) - NOT written.`)
    process.exit(1)
  }
  if (ctx.has('--write')) {
    const written = await writeIntentProject(ast, intentPath)
    console.log(`\nok theme written (${written.length} file(s)).`)
  } else {
    console.log('\n(dry run - add --write to persist)')
  }
}

export function runMarketplace(ctx, projectDir, cfg) {
  if (ctx.args[1] === 'install') {
    runMarketplaceInstall(ctx, projectDir, cfg)
    return
  }
  const data = {
    targets: Object.values(TARGETS).map((target) => ({
      id: target.id,
      version: target.version || null,
      framework: target.framework,
      ui: target.ui,
      components: target.supported_components.length,
      actions: target.supported_actions.length,
      source: target.plugin ? 'plugin' : 'core',
      module: target.module,
    })),
    themes: listThemePacks(),
    domain_modules: Object.entries(DOMAIN_MODULES).map(([id, module]) => ({ id, ...module })),
  }
  const kind = ctx.flag('kind', null)
  const filtered = kind ? { [kind]: data[kind] || [] } : data
  if (ctx.has('--json')) console.log(JSON.stringify(filtered, null, 2))
  else printMarketplace(data, kind)
}

function runMarketplaceInstall(ctx, projectDir, cfg) {
  const manifestPath = ctx.args[2] && !ctx.args[2].startsWith('--') ? ctx.args[2] : ctx.flag('manifest', null)
  try {
    const result = installMarketplacePlugin({ projectDir, cfg, manifestPath, write: ctx.has('--write') })
    if (ctx.has('--json')) console.log(JSON.stringify(result, null, 2))
    else {
      console.log(`IntentStack marketplace install - ${result.id}@${result.version}`)
      console.log(`Type: ${result.type}`)
      console.log(`Module: ${result.module}`)
      console.log(`Compatibility: ${result.compatibility}`)
      if (result.written) console.log('ok plugin installed and pinned in marketplace lock')
      else console.log('(dry run - add --write to install)')
    }
  } catch (e) {
    console.error(e.message)
    process.exit(2)
  }
}

function printMarketplace(data, kind) {
  console.log('IntentStack Marketplace')
  if (!kind || kind === 'targets') {
    console.log('\nTargets:')
    for (const target of data.targets) console.log(`  ${target.id}: ${target.framework}/${target.ui}`)
  }
  if (!kind || kind === 'themes') {
    console.log('\nThemes:')
    for (const theme of data.themes) console.log(`  ${theme.id}: ${theme.label}`)
  }
  if (!kind || kind === 'domain_modules') {
    console.log('\nDomain modules:')
    for (const module of data.domain_modules) console.log(`  ${module.id}: ${module.status}`)
  }
}

export function writeJsonFile(path, data) {
  const outPath = resolve(path)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n')
  return outPath
}
