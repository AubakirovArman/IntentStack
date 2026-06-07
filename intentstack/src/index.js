#!/usr/bin/env node
// IntentStack v0.1 CLI - reference implementation.
// Pipeline (PRD 17): load -> parse -> normalize -> validate -> build graph -> plan -> emit -> format -> verify -> report.
import { resolve, join, dirname } from 'node:path'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { parseIntentFile } from './parse.js'
import { findIntent, loadIntentProject, writeIntentProject } from './intent_loader.js'
import { normalize } from './normalize.js'
import { validate } from './validate.js'
import { buildGraph } from './graph.js'
import { emit, getAdapter, planFiles } from './emit/index.js'
import { formatGeneratedFiles, runNpm, verifyGeneratedApp } from './pipeline.js'
import { applyPatch, patchOps } from './patch.js'
import { FIELD_TYPES, TARGETS } from './registry.js'
import { diffPlannedFiles, formatDiff } from './diff.js'
import { DOMAIN_MODULES } from './modules.js'
import { intentSchema } from './schema.js'
import { renderGraphHtml } from './visual_graph.js'
import { generateDocsSite } from './docs_site.js'
import { formatOpenApi, generateOpenApi, openApiFormat } from './openapi.js'
import { generateTestFiles } from './testgen.js'
import { deploymentPlan } from './deploy.js'
import { getThemePack, listThemePacks } from './themes.js'
import { collaborationReport, formatCollabReport } from './collab.js'

const args = process.argv.slice(2)
const cmd = args[0]

function flag(name, def) {
  const i = args.indexOf(`--${name}`)
  if (i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')) return args[i + 1]
  return def
}

async function readConfig(dir) {
  const p = join(dir, 'intentstack.config.yaml')
  if (!existsSync(p)) return {}
  try {
    const mod = await import('js-yaml')
    const YAML = mod.default ?? mod
    return YAML.load(readFileSync(p, 'utf8')) || {}
  } catch { return {} }
}

async function loadAst(projectDir, cfg) {
  try {
    return await loadIntentProject(projectDir, cfg, {
      intentArg: flag('intent', null),
      targetOverride: flag('target', null),
    })
  } catch (e) {
    console.error(`[E1000] Intent load error:\n  ${e.message}`)
    process.exit(2)
  }
}

async function main() {
  const projectDir = resolve(flag('project', '.'))

  if (cmd === 'new') {
    const dirArg = (args[1] && !args[1].startsWith('--')) ? args[1] : flag('dir', null)
    if (!dirArg) { console.error('Usage: intentstack new <dir> [--target web_ts_minimal] [--name NAME] [--single-file]'); process.exit(2) }
    const dir = resolve(dirArg)
    const target = flag('target', 'web_ts_minimal')
    if (!TARGETS[target]) { console.error(`Unknown target "${target}". Available: ${Object.keys(TARGETS).join(', ')}`); process.exit(2) }
    const name = flag('name', 'IntentStack App')
    const id = flag('id', name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'intentstack_app')
    mkdirSync(join(dir, 'intent'), { recursive: true })
    writeFileSync(join(dir, 'intentstack.config.yaml'), `intent: intent/app.intent.yaml\nout: app\ntarget: ${target}\n`)
    if (args.includes('--single-file')) writeFileSync(join(dir, 'intent/app.intent.yaml'), sampleIntent({ id, name, target }))
    else writeSampleModularIntent(dir, { id, name, target })
    console.log(`\nok created IntentStack project -> ${dir}`)
    console.log('Next:  node <path-to-intentstack>/src/index.js check --project ' + dir)
    return
  }

  if (cmd === 'list_capabilities') {
    const target = flag('target', null)
    const targets = target ? { [target]: TARGETS[target] } : TARGETS
    if (target && !TARGETS[target]) { console.error(`Unknown target "${target}". Available: ${Object.keys(TARGETS).join(', ')}`); process.exit(2) }
    const data = {
      targets,
      field_types: FIELD_TYPES,
      patch_ops: patchOps(),
      domain_modules: DOMAIN_MODULES,
      theme_packs: listThemePacks(),
    }
    if (args.includes('--json')) console.log(JSON.stringify(data, null, 2))
    else {
      console.log('Targets:')
      for (const [id, t] of Object.entries(targets)) {
        console.log(`  ${id}`)
        console.log(`    components: ${t.supported_components.join(', ')}`)
        console.log(`    actions:    ${t.supported_actions.join(', ')}`)
        console.log(`    fields:     ${t.supported_field_types.join(', ')}`)
      }
      console.log('\nPatch ops:')
      for (const op of data.patch_ops) console.log('  ' + op)
      console.log('\nDomain modules:')
      for (const [id, m] of Object.entries(data.domain_modules)) console.log(`  ${id} (${m.version}, ${m.status})`)
      console.log('\nTheme packs:')
      for (const pack of data.theme_packs) console.log(`  ${pack.id}: ${pack.label}`)
    }
    return
  }

  if (cmd === 'schema') {
    const schema = intentSchema()
    const out = flag('out', null)
    if (out) {
      const p = resolve(out)
      mkdirSync(dirname(p), { recursive: true })
      writeFileSync(p, JSON.stringify(schema, null, 2) + '\n')
      console.log(`ok schema written -> ${p}`)
    } else {
      console.log(JSON.stringify(schema, null, 2))
    }
    return
  }

  if (cmd === 'verify') {
    const examplesDir = resolve(flag('examples', 'examples'))
    const targets = flag('targets', Object.keys(TARGETS).join(','))
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
    const unknownTarget = targets.find((target) => !TARGETS[target])
    if (unknownTarget) { console.error(`Unknown target "${unknownTarget}". Available: ${Object.keys(TARGETS).join(', ')}`); process.exit(2) }
    const result = await verifyExamples(examplesDir, targets, { npmBuild: args.includes('--npm-build') })
    console.log(`\nIntentStack verify - ${examplesDir}`)
    for (const row of result.rows) {
      const mark = row.ok ? 'ok' : 'x'
      console.log(`  ${mark} ${row.example} -> ${row.target}${row.files != null ? ` (${row.files} files)` : ''}${row.error ? `: ${row.error}` : ''}`)
    }
    if (result.failures > 0) {
      console.error(`\nx verify failed: ${result.failures} matrix item(s) failed.`)
      process.exit(1)
    }
    console.log(`\nok verify passed: ${result.rows.length} matrix item(s).`)
    return
  }

  if (cmd === 'docs') {
    const outDir = resolve(flag('out', 'docs-site'))
    const files = generateDocsSite(projectDir, outDir)
    console.log(`ok docs site written -> ${outDir}`)
    console.log(`   pages: ${files.join(', ')}`)
    return
  }

  const cfg = await readConfig(projectDir)

  if (cmd === 'themes') {
    const apply = flag('apply', flag('preset', (args[1] && !args[1].startsWith('--')) ? args[1] : null))
    if (!apply) {
      const packs = listThemePacks()
      if (args.includes('--json')) console.log(JSON.stringify({ themes: packs }, null, 2))
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
    const { intentPath, ast } = await loadAst(projectDir, cfg)
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
    if (d.hasErrors()) { console.error(`\nx theme pack would introduce ${d.errors.length} error(s) - NOT written.`); process.exit(1) }
    if (args.includes('--write')) {
      const written = await writeIntentProject(ast, intentPath)
      console.log(`\nok theme written (${written.length} file(s)).`)
    } else {
      console.log('\n(dry run - add --write to persist)')
    }
    return
  }

  if (cmd === 'marketplace') {
    const data = {
      targets: Object.values(TARGETS).map((target) => ({
        id: target.id,
        framework: target.framework,
        ui: target.ui,
        components: target.supported_components.length,
        actions: target.supported_actions.length,
      })),
      themes: listThemePacks(),
      domain_modules: Object.entries(DOMAIN_MODULES).map(([id, module]) => ({ id, ...module })),
    }
    const kind = flag('kind', null)
    const filtered = kind ? { [kind]: data[kind] || [] } : data
    if (args.includes('--json')) console.log(JSON.stringify(filtered, null, 2))
    else {
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
    return
  }

  if (cmd === 'split') {
    const { intentPath, ast } = await loadAst(projectDir, cfg)
    const coreAst = normalize(ast)
    const outIntentDir = resolve(projectDir, flag('out-intent-dir', 'intent'))
    const d = validate(coreAst, { projectDir, outDir: resolve(projectDir, flag('out', cfg.out || 'app')) })
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
    if (args.includes('--write')) {
      await writeSplitFiles(outIntentDir, files)
      console.log(`\nok split written (${Object.keys(files).length} files).`)
    } else {
      console.log('\n(dry run - add --write to persist)')
    }
    return
  }

  if (cmd === 'check' || cmd === 'build') {
    const { intentPath, ast } = await loadAst(projectDir, cfg)
    const coreAst = normalize(ast)
    const outDir = resolve(projectDir, flag('out', cfg.out || 'app'))
    const d = validate(coreAst, { projectDir, outDir })
    console.log(`\nIntentStack ${cmd} - ${intentPath}`)
    console.log(`Target: ${ast?.project?.target ?? '(none)'}\n`)
    console.log('Normalize: ok')
    console.log('Diagnostics:')
    console.log(d.format())
    if (args.includes('--json')) console.log('\nJSON diagnostics:\n' + JSON.stringify(d.toJSON(), null, 2))
    if (d.hasErrors()) {
      console.error(`\nx ${d.errors.length} error(s). ${cmd === 'build' ? 'Build aborted - no files written.' : 'check failed.'}`)
      process.exit(1)
    }
    if (cmd === 'check') {
      console.log(`\nok check passed (${d.warnings.length} warning(s)).`)
      return
    }
    const graph = buildGraph(coreAst)
    const written = emit(graph, outDir)
    const format = formatGeneratedFiles(outDir, written, { enabled: !args.includes('--no-format') })
    const verify = verifyGeneratedApp(outDir, {
      enabled: !args.includes('--no-verify'),
      install: args.includes('--verify-install'),
    })
    report(written, outDir, d, coreAst, { format, verify })
    if (format.some((row) => row.status === 'failed')) process.exit(1)
    if (verify.status === 'failed') process.exit(1)
    return
  }

  if (cmd === 'apply') {
    const { intentPath, ast } = await loadAst(projectDir, cfg)
    const patchArg = (args[1] && !args[1].startsWith('--')) ? args[1] : flag('patch', null)
    if (!patchArg) { console.error('Usage: intentstack apply <patch.yaml> [--write] [--out-intent FILE]'); process.exit(2) }
    let patchDoc
    try { patchDoc = await parseIntentFile(resolve(patchArg)) }
    catch (e) { console.error(`[E1000] Parse error in ${patchArg}: ${e.message}`); process.exit(2) }
    const { changes, errors } = applyPatch(ast, patchDoc)
    console.log(`\nIntentStack apply - ${patchArg}`)
    if (errors.length) { console.error('\nPatch errors:'); for (const e of errors) console.error('  - ' + e); process.exit(1) }
    console.log('\nSemantic diff:')
    if (changes.length === 0) console.log('  (no changes)')
    for (const c of changes) {
      if (c.before !== undefined) console.log(`  ~ ${c.summary}\n      old: ${JSON.stringify(c.before)}\n      new: ${JSON.stringify(c.after)}`)
      else console.log(`  + ${c.summary}`)
    }
    const coreAst = normalize(ast)
    const d = validate(coreAst, { projectDir, outDir: resolve(projectDir, flag('out', cfg.out || 'app')) })
    console.log('\nValidation of patched intent:')
    console.log(d.format())
    if (d.hasErrors()) { console.error(`\nx patch would introduce ${d.errors.length} error(s) - NOT written.`); process.exit(1) }
    if (args.includes('--write')) {
      const outIntent = flag('out-intent', intentPath)
      const written = await writeIntentProject(ast, outIntent, { singleFile: outIntent !== intentPath })
      appendPatchHistory(outIntent, patchArg, changes)
      console.log(`\nok patched intent written -> ${outIntent}`)
      if (ast.__intentstack?.modular && outIntent === intentPath) {
        console.log(`   modules updated: ${written.length}`)
      }
    } else {
      console.log('\n(dry run - add --write to persist, or --out-intent FILE to write a copy)')
    }
    return
  }

  if (cmd === 'plan') {
    const { ast } = await loadAst(projectDir, cfg)
    const coreAst = normalize(ast)
    const d = validate(coreAst, { projectDir, outDir: resolve(projectDir, flag('out', cfg.out || 'app')) })
    if (d.hasErrors()) { console.log(d.format()); process.exit(1) }
    const files = planFiles(buildGraph(coreAst))
    console.log('Planned files:')
    for (const f of Object.keys(files).sort()) console.log('  + ' + f)
    return
  }

  if (cmd === 'diff') {
    const { intentPath, ast } = await loadAst(projectDir, cfg)
    const coreAst = normalize(ast)
    const d = validate(coreAst, { projectDir, outDir: resolve(projectDir, flag('out', cfg.out || 'app')) })
    if (d.hasErrors()) { console.log(d.format()); process.exit(1) }
    const graph = buildGraph(coreAst)
    const outDir = resolve(projectDir, flag('out', cfg.out || 'app'))
    const files = formatPlannedForDiff(planFiles(graph), outDir)
    const adapter = getAdapter(graph)
    const diff = diffPlannedFiles(files, outDir, adapter.managedZones || [])
    console.log(`\nIntentStack diff - ${intentPath}`)
    console.log(`Output: ${outDir}\n`)
    console.log(formatDiff(diff, { verbose: args.includes('--verbose') }))
    if (!diff.hasChanges) console.log('\nok generated output matches current plan.')
    return
  }

  if (cmd === 'doctor') {
    const { intentPath, ast } = await loadAst(projectDir, cfg)
    const coreAst = normalize(ast)
    const d = validate(coreAst, { projectDir, outDir: resolve(projectDir, flag('out', cfg.out || 'app')) })
    const graph = buildGraph(coreAst)
    console.log(`\nIntentStack doctor - ${projectDir}`)
    console.log(`Node: ${process.version}`)
    console.log(`Intent: ${intentPath}`)
    console.log(`Target: ${ast?.project?.target ?? '(none)'}`)
    console.log('\nDiagnostics:')
    console.log(d.format())
    if (d.hasErrors()) { console.error(`\nx doctor found ${d.errors.length} blocking error(s).`); process.exit(1) }
    const files = planFiles(graph)
    console.log(`\nPlan: ${Object.keys(files).length} files`)
    const adapter = getAdapter(graph)
    console.log(`Managed zones: ${(adapter.managedZones || []).join(', ') || '(none)'}`)
    console.log('\nok doctor passed.')
    return
  }

  if (cmd === 'graph') {
    const { intentPath, ast } = await loadAst(projectDir, cfg)
    const coreAst = normalize(ast)
    const d = validate(coreAst, { projectDir, outDir: resolve(projectDir, flag('out', cfg.out || 'app')) })
    if (d.hasErrors()) { console.log(d.format()); process.exit(1) }
    const graph = buildGraph(coreAst)
    const data = graphSummary(graph)
    const htmlOut = flag('html', null)
    if (htmlOut) {
      const outPath = resolve(htmlOut)
      mkdirSync(dirname(outPath), { recursive: true })
      writeFileSync(outPath, renderGraphHtml(data, readPatchHistory(intentPath)))
      console.log(`ok graph HTML written -> ${outPath}`)
      return
    }
    if (args.includes('--json')) console.log(JSON.stringify(data, null, 2))
    else {
      console.log(`Project: ${data.project.id} (${data.project.target})`)
      console.log('Entities:')
      for (const e of data.entities) console.log(`  ${e.id} -> ${e.table} (${e.fields.join(', ')})`)
      console.log('Actions:')
      for (const a of data.actions) console.log(`  ${a.id}: ${a.type}${a.entity ? ` ${a.entity}` : ''}`)
      console.log('Pages:')
      for (const p of data.pages) console.log(`  ${p.id} ${p.path}: ${p.sections.map((s) => `${s.id}:${s.type}`).join(', ')}`)
      if (data.modules?.modular) {
        console.log('Modules:')
        console.log(`  root: ${data.modules.root_path}`)
        console.log(`  files: ${data.modules.source_files.length}`)
      }
    }
    return
  }

  if (cmd === 'collab') {
    const { ast } = await loadAst(projectDir, cfg)
    const graph = buildGraph(normalize(ast))
    const data = collaborationReport(graph, projectDir, { base: flag('base', 'HEAD') })
    if (args.includes('--json')) console.log(JSON.stringify(data, null, 2))
    else console.log('\n' + formatCollabReport(data))
    if (args.includes('--strict') && data.findings.length > 0) process.exit(1)
    return
  }

  if (cmd === 'editor') {
    const { intentPath, ast } = await loadAst(projectDir, cfg)
    const coreAst = normalize(ast)
    const d = validate(coreAst, { projectDir, outDir: resolve(projectDir, flag('out', cfg.out || 'app')) })
    if (d.hasErrors()) { console.log(d.format()); process.exit(1) }
    const graph = buildGraph(coreAst)
    const outPath = resolve(flag('out', 'intentstack-editor.html'))
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, renderGraphHtml(graphSummary(graph), readPatchHistory(intentPath)))
    console.log(`ok visual editor written -> ${outPath}`)
    console.log('Open the file in a browser and use Patch Builder for semantic edits.')
    return
  }

  if (cmd === 'openapi') {
    const { ast } = await loadAst(projectDir, cfg)
    const coreAst = normalize(ast)
    const d = validate(coreAst, { projectDir, outDir: resolve(projectDir, cfg.out || 'app') })
    if (d.hasErrors()) { console.log(d.format()); process.exit(1) }
    const graph = buildGraph(coreAst)
    const spec = generateOpenApi(graph)
    const out = flag('out', null)
    const format = openApiFormat({ out, yaml: args.includes('--yaml') })
    const body = formatOpenApi(spec, format)
    if (out) {
      const outPath = resolve(out)
      mkdirSync(dirname(outPath), { recursive: true })
      writeFileSync(outPath, body)
      console.log(`ok OpenAPI ${format} written -> ${outPath}`)
    } else if (format === 'yaml') {
      console.log(body)
    } else {
      console.log(body.trimEnd())
    }
    return
  }

  if (cmd === 'testgen') {
    const { ast } = await loadAst(projectDir, cfg)
    const coreAst = normalize(ast)
    const d = validate(coreAst, { projectDir, outDir: resolve(projectDir, cfg.out || 'app') })
    if (d.hasErrors()) { console.log(d.format()); process.exit(1) }
    const graph = buildGraph(coreAst)
    const outDir = resolve(projectDir, flag('out', 'tests/generated'))
    const files = generateTestFiles(graph)
    for (const [rel, content] of Object.entries(files)) {
      const outPath = join(outDir, rel)
      mkdirSync(dirname(outPath), { recursive: true })
      writeFileSync(outPath, content)
    }
    console.log(`ok generated tests written -> ${outDir}`)
    for (const file of Object.keys(files).sort()) console.log(`  + ${file}`)
    return
  }

  if (cmd === 'deploy') {
    const platform = flag('platform', (args[1] && !args[1].startsWith('--')) ? args[1] : null)
    if (!platform) { console.error('Usage: intentstack deploy --platform vercel|netlify|render [--project DIR] [--out DIR] [--dry-run] [--no-build]'); process.exit(2) }
    let plan
    const { intentPath, ast } = await loadAst(projectDir, cfg)
    const coreAst = normalize(ast)
    const outDir = resolve(projectDir, flag('out', cfg.out || 'app'))
    const d = validate(coreAst, { projectDir, outDir })
    if (d.hasErrors()) { console.log(d.format()); process.exit(1) }
    const graph = buildGraph(coreAst)
    try { plan = deploymentPlan(graph, platform) }
    catch (e) { console.error(e.message); process.exit(2) }
    console.log(`\nIntentStack deploy - ${intentPath}`)
    console.log(`Platform: ${plan.platform}`)
    console.log(`Output app: ${outDir}`)
    console.log(`Command: ${plan.command}`)
    for (const warning of plan.warnings) console.log(`Warning: ${warning}`)
    console.log('\nDeployment files:')
    for (const file of Object.keys(plan.files).sort()) console.log(`  + ${file}`)
    if (args.includes('--dry-run')) {
      console.log('\n(dry run - remove --dry-run to write deployment files)')
      return
    }
    if (!args.includes('--no-build')) {
      const written = emit(graph, outDir)
      const format = formatGeneratedFiles(outDir, written, { enabled: !args.includes('--no-format') })
      const verify = verifyGeneratedApp(outDir, {
        enabled: !args.includes('--no-verify'),
        install: args.includes('--verify-install'),
      })
      if (format.some((row) => row.status === 'failed')) process.exit(1)
      if (verify.status === 'failed') process.exit(1)
      console.log(`\nok generated app prepared (${written.length} files).`)
    }
    for (const [rel, content] of Object.entries(plan.files)) {
      const outPath = join(outDir, rel)
      mkdirSync(dirname(outPath), { recursive: true })
      writeFileSync(outPath, content)
    }
    console.log(`ok deployment files written -> ${outDir}`)
    console.log(`Next: cd ${outDir} && ${plan.command}`)
    return
  }

  if (cmd === 'stats') {
    const { intentPath, ast } = await loadAst(projectDir, cfg)
    const coreAst = normalize(ast)
    const d = validate(coreAst, { projectDir, outDir: resolve(projectDir, flag('out', cfg.out || 'app')) })
    const graph = buildGraph(coreAst)
    const data = statsSummary(graph, d, d.hasErrors() ? {} : planFiles(graph))
    const statsOut = flag('out-stats', flag('out-json', null))
    if (statsOut) {
      const outPath = resolve(statsOut)
      mkdirSync(dirname(outPath), { recursive: true })
      writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n')
      console.log(`ok stats written -> ${outPath}`)
      return
    }
    if (args.includes('--json')) console.log(JSON.stringify(data, null, 2))
    else {
      console.log(`\nIntentStack stats - ${intentPath}`)
      console.log(`Project: ${data.project.id} (${data.project.target})`)
      console.log(`Pages: ${data.counts.pages}   Sections: ${data.counts.sections}   Entities: ${data.counts.entities}   Actions: ${data.counts.actions}`)
      console.log(`Workflows: ${data.counts.workflows}   Integrations: ${data.counts.integrations}   Planned files: ${data.counts.planned_files}`)
      console.log(`Diagnostics: ${data.diagnostics.errors} error(s), ${data.diagnostics.warnings} warning(s)`)
    }
    if (d.hasErrors()) process.exit(1)
    return
  }

  if (cmd === 'security') {
    const { intentPath, ast } = await loadAst(projectDir, cfg)
    const coreAst = normalize(ast)
    const d = validate(coreAst, { projectDir, outDir: resolve(projectDir, flag('out', cfg.out || 'app')) })
    const graph = buildGraph(coreAst)
    const data = securitySummary(graph, d)
    if (args.includes('--json')) console.log(JSON.stringify(data, null, 2))
    else {
      console.log(`\nIntentStack security - ${intentPath}`)
      for (const item of data.findings) console.log(`  [${item.severity}] ${item.code}: ${item.message}`)
      if (data.findings.length === 0) console.log('  ok no security findings')
    }
    if (d.hasErrors() || (args.includes('--strict') && data.findings.length > 0)) process.exit(1)
    return
  }

  if (cmd === 'migrate') {
    const { intentPath, ast } = await loadAst(projectDir, cfg)
    const from = flag('from', String(ast.version ?? '0.1'))
    const to = flag('to', '0.1')
    if (from !== '0.1' || to !== '0.1') {
      console.error(`No migrator available from ${from} to ${to}. Current compiler supports DSL 0.1.`)
      process.exit(1)
    }
    console.log(`\nIntentStack migrate - ${intentPath}`)
    console.log('No migration needed: DSL is already 0.1.')
    return
  }

  if (cmd === 'explain') {
    const { ast } = await loadAst(projectDir, cfg)
    explain(normalize(ast), args[1])
    return
  }

  help()
}

async function verifyExamples(examplesDir, targets, opts = {}) {
  const rows = []
  const entries = existsSync(examplesDir)
    ? readdirSync(examplesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
    : []
  for (const example of entries) {
    const projectDir = join(examplesDir, example)
    const intentPath = findIntent(projectDir)
    if (!intentPath) {
      rows.push({ example, target: '(none)', ok: false, error: 'missing intent file' })
      continue
    }
    let ast
    try { ast = (await loadIntentProject(projectDir, {}, { intentPath })).ast }
    catch (e) {
      rows.push({ example, target: '(parse)', ok: false, error: e.message })
      continue
    }
    for (const target of targets) {
      const nextAst = JSON.parse(JSON.stringify(ast))
      nextAst.project = { ...(nextAst.project || {}), target }
      const coreAst = normalize(nextAst)
      const outDir = mkdtempSync(join(tmpdir(), 'intentstack-verify-'))
      try {
        const d = validate(coreAst, { projectDir, outDir })
        if (d.hasErrors()) {
          rows.push({ example, target, ok: false, error: d.errors.map((e) => e.code).join(', ') })
          continue
        }
        const written = emit(buildGraph(coreAst), outDir)
        if (opts.npmBuild) {
          const installed = runNpm(outDir, ['install'])
          if (installed.status !== 0) {
            rows.push({ example, target, ok: false, error: `npm install failed: ${installed.error}` })
            continue
          }
          const built = runNpm(outDir, ['run', 'build'])
          if (built.status !== 0) {
            rows.push({ example, target, ok: false, error: `npm run build failed: ${built.error}` })
            continue
          }
        }
        rows.push({ example, target, ok: true, files: written.length })
      } catch (e) {
        rows.push({ example, target, ok: false, error: e.message })
      } finally {
        rmSync(outDir, { recursive: true, force: true })
      }
    }
  }
  return { rows, failures: rows.filter((row) => !row.ok).length }
}

function patchHistoryPath(intentPath) {
  return join(dirname(intentPath), '.intentstack', 'patch-history.ndjson')
}

function appendPatchHistory(intentPath, patchArg, changes) {
  const p = patchHistoryPath(intentPath)
  mkdirSync(dirname(p), { recursive: true })
  appendFileSync(p, JSON.stringify({
    timestamp: new Date().toISOString(),
    patch: patchArg,
    changes,
  }) + '\n')
}

function readPatchHistory(intentPath) {
  const p = patchHistoryPath(intentPath)
  if (!existsSync(p)) return []
  return readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line) }
      catch { return null }
    })
    .filter(Boolean)
}

function formatPlannedForDiff(files, outDir) {
  const rels = Object.keys(files)
  const tempDir = mkdtempSync(join(tmpdir(), 'intentstack-diff-'))
  try {
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(tempDir, rel)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, content)
    }
    const rows = formatGeneratedFiles(tempDir, rels, { toolRoot: outDir })
    if (rows.some((row) => row.status === 'failed')) return files
    return Object.fromEntries(rels.map((rel) => [rel, readFileSync(join(tempDir, rel), 'utf8')]))
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

function report(written, outDir, d, ast, phases = {}) {
  const count = (pre) => written.filter((f) => f.startsWith(pre)).length
  console.log(`\nok Generated ${written.length} files into ${outDir}`)
  console.log(`   target: ${ast?.project?.target}`)
  console.log(`   frontend: ${count('src/') + count('app/') + count('components/')}   api: ${count('server/') + count('app/api/')}   lib: ${count('lib/')}   migrations: ${count('migrations/')}`)
  if (d.warnings.length) console.log(`   warnings: ${d.warnings.length} (non-blocking)`)
  if (phases.format) {
    for (const row of phases.format) {
      const suffix = row.status === 'ok' ? row.detail : row.reason
      console.log(`   format ${row.tool}: ${row.status}${suffix ? ` (${suffix})` : ''}`)
    }
  }
  if (phases.verify) {
    const suffix = phases.verify.command || phases.verify.reason || phases.verify.error
    console.log(`   verify: ${phases.verify.status}${suffix ? ` (${suffix})` : ''}`)
  }
  console.log('\nNext:  cd <app-dir> && npm install && npm run dev')
}

function explain(ast, path) {
  if (!path) { console.log('Usage: intentstack explain page.<id>.section.<id>'); return }
  const target = TARGETS[ast?.project?.target]
  let found
  for (const p of ast.pages || []) {
    for (const s of p.sections || []) {
      const canon = `page.${p.id}.section.${s.id}`
      if (path === canon || path === `${p.id}.${s.id}`) found = { p, s }
    }
  }
  console.log(`\nexplain ${path}`)
  if (!found) { console.log('  (no matching section)'); return }
  const { p, s } = found
  console.log(`  section "${s.id}"  type=${s.type}  on page "${p.id}" (${p.path})`)
  console.log(`  rendered by: target_${ast.project.target}::${s.type}`)
  console.log(`  supported:   ${target?.supported_components?.includes(s.type) ? 'yes' : 'NO'}`)
}

function help() {
  const lines = [
    'IntentStack v0.1 - AI-native fullstack compiler (reference implementation)',
    '',
    '  Intent DSL describes WHAT the app is; the target adapter decides HOW to build it.',
    '  Targets:  web_ts_minimal  (Vite + React + Tailwind/daisyUI, Hono, Drizzle + SQLite)',
    '            next_shadcn     (Next.js App Router + shadcn/ui, route handlers, Drizzle + SQLite)',
    '',
    'Usage:',
    '  intentstack check   [--project DIR] [--intent FILE] [--json]    validate only',
    '  intentstack build   [--project DIR] [--out DIR] [--target T]    validate + generate + format + verify',
    '                      [--no-format] [--no-verify] [--verify-install]',
    '  intentstack new     <dir> [--target T] [--name NAME] [--single-file] create a modular intent project',
    '  intentstack apply   <patch.yaml> [--write] [--out-intent F]     apply a semantic patch',
    '  intentstack split   [--project DIR] [--write]                  split monolith intent into modules',
    '  intentstack plan    [--project DIR]                             list planned files',
    '  intentstack diff    [--project DIR] [--out DIR] [--verbose]      compare planned files to disk',
    '  intentstack explain page.<id>.section.<id>                      show how a node compiles',
    '  intentstack doctor  [--project DIR]                             validate environment and plan',
    '  intentstack graph   [--project DIR] [--json|--html FILE]        print/export Core IR graph',
    '  intentstack collab  [--project DIR] [--base REF] [--json]       inspect git/module owner changes',
    '  intentstack editor  [--project DIR] [--out FILE]                 export visual patch editor',
    '  intentstack openapi [--project DIR] [--out FILE] [--yaml]        print/export OpenAPI spec',
    '  intentstack testgen [--project DIR] [--out DIR]                  generate API contract tests',
    '  intentstack deploy  --platform P [--project DIR] [--out DIR]     prepare deploy config',
    '  intentstack themes  [--json|--apply PRESET --write]              list/apply theme packs',
    '  intentstack marketplace [--json] [--kind K]                      list local extensions',
    '  intentstack stats   [--project DIR] [--json] [--out-stats FILE]  print app/compiler metrics',
    '  intentstack security [--project DIR] [--json] [--strict]          audit security posture',
    '  intentstack docs    [--project DIR] [--out DIR]                  generate static docs site',
    '  intentstack migrate [--project DIR] [--from V] [--to V]          migrate DSL versions',
    '  intentstack list_capabilities [--target T] [--json]              print targets and patch ops',
    '  intentstack schema  [--out FILE]                                 print JSON Schema for DSL v0.1',
    '  intentstack verify  [--examples DIR] [--targets A,B] [--npm-build] verify examples x targets',
  ]
  console.log(lines.join('\n'))
}

function splitIntentFiles(ast) {
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
    if (!entity?.id) continue
    files[`backend/entities/${kebab(entity.id)}.entity.yaml`] = { entity: clone(entity) }
  }
  for (const action of ast.actions || []) {
    if (!action?.id) continue
    files[`backend/actions/${kebab(action.id)}.action.yaml`] = { action: clone(action) }
  }
  for (const workflow of ast.workflows || []) {
    if (!workflow?.id) continue
    files[`backend/workflows/${kebab(workflow.id)}.workflow.yaml`] = { workflow: clone(workflow) }
  }
  for (const integration of ast.integrations || []) {
    if (!integration?.id) continue
    files[`backend/integrations/${kebab(integration.id)}.integration.yaml`] = { integration: clone(integration) }
  }

  for (const page of ast.pages || []) {
    if (!page?.id) continue
    const pageId = kebab(page.id)
    const pageDoc = clone(page)
    pageDoc.sections = (page.sections || []).map((section) => ({ ref: section.id }))
    files[`frontend/pages/${pageId}.page.yaml`] = { page: pageDoc }
    for (const section of page.sections || []) {
      if (!section?.id) continue
      files[`frontend/sections/${pageId}/${kebab(section.id)}.section.yaml`] = { section: clone(section) }
    }
  }
  return files
}

async function writeSplitFiles(outIntentDir, files) {
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

function writeSampleModularIntent(dir, { id, name, target }) {
  const files = {
    'intent/app.intent.yaml': `version: 0.1

project:
  id: ${id}
  name: ${name}
  target: ${target}

includes:
  - shared/*.yaml
  - backend/entities/*.yaml
  - backend/actions/*.yaml
  - frontend/pages/*.yaml
  - frontend/sections/**/*.yaml
`,
    'intent/shared/theme.yaml': `theme:
  preset: minimal
  radius: md
  density: comfortable
  color: neutral
`,
    'intent/shared/navigation.yaml': `navigation:
  logo: ${name}
  items:
    - label: Home
      href: /
    - label: Contact
      href: "#lead_form"
    - label: Leads
      href: /dashboard/leads
`,
    'intent/backend/entities/lead.entity.yaml': `entity:
  id: Lead
  table: leads
  fields:
    - id: name
      type: string
      label: Name
      required: true
    - id: email
      type: string
      label: Email
      required: true
    - id: message
      type: text
      label: Message
      required: false
    - id: status
      type: enum
      values: [new, contacted, closed]
      default: new
`,
    'intent/backend/actions/create-lead.action.yaml': `action:
  id: create_lead
  type: create_record
  entity: Lead
`,
    'intent/backend/actions/list-leads.action.yaml': `action:
  id: list_leads
  type: list_records
  entity: Lead
`,
    'intent/frontend/pages/home.page.yaml': `page:
  id: home
  path: /
  layout: landing
  sections:
    - ref: hero
    - ref: lead_form
    - ref: footer
`,
    'intent/frontend/pages/dashboard-leads.page.yaml': `page:
  id: dashboard_leads
  path: /dashboard/leads
  layout: dashboard
  title: Leads
  sections:
    - ref: leads_table
`,
    'intent/frontend/sections/home/hero.section.yaml': `section:
  id: hero
  type: hero
  title: ${name}
  subtitle: Generated from modular intent files.
  actions:
    - label: Contact
      kind: primary
      target: "#lead_form"
`,
    'intent/frontend/sections/home/lead-form.section.yaml': `section:
  id: lead_form
  type: form
  title: Contact
  entity: Lead
  fields: [name, email, message]
  submit:
    action: create_lead
    success_message: Thanks. We will contact you soon.
`,
    'intent/frontend/sections/home/footer.section.yaml': `section:
  id: footer
  type: footer
  text: Generated by IntentStack.
`,
    'intent/frontend/sections/dashboard/leads-table.section.yaml': `section:
  id: leads_table
  type: table
  entity: Lead
  source:
    action: list_leads
  columns: [name, email, status]
`,
  }
  for (const [rel, content] of Object.entries(files)) {
    const file = join(dir, ...rel.split('/'))
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
  }
}

function graphSummary(graph) {
  return {
    version: graph.version,
    project: graph.project,
    theme: graph.theme,
    auth: graph.auth,
    tenancy: graph.tenancy,
    entities: graph.entities.map((e) => ({
      id: e.id,
      table: e.table || e.id.toLowerCase(),
      fields: (e.fields || []).map((f) => f.id),
    })),
    actions: graph.actions.map((a) => ({ id: a.id, type: a.type, entity: a.entity })),
    pages: graph.pages.map((p) => ({
      id: p.id,
      path: p.path,
      layout: p.layout,
      sections: (p.sections || []).map((s) => ({ id: s.id, type: s.type })),
    })),
    workflows: graph.workflows.map((w) => ({ id: w.id, trigger: w.trigger })),
    integrations: graph.integrations.map((i) => ({ id: i.id, type: i.type })),
    ir: {
      symbol_count: graph.symbolTable.length,
      binding_count: graph.bindings.length,
      symbols: graph.symbolTable,
      bindings: graph.bindings,
      types: graph.types,
    },
    modules: graph.modules?.modular ? {
      modular: true,
      root_path: graph.modules.rootPath,
      includes: graph.modules.includes,
      source_files: graph.modules.sourceFiles,
      owners: graph.modules.owners,
    } : { modular: false, source_files: [] },
  }
}

function statsSummary(graph, diagnostics, files) {
  const sectionCount = graph.pages.reduce((sum, page) => sum + (page.sections || []).length, 0)
  const fieldCount = graph.entities.reduce((sum, entity) => sum + (entity.fields || []).length, 0)
  const protectedPages = graph.pages.filter((page) => page.auth && page.auth !== 'reserved').length
  const protectedActions = graph.actions.filter((action) => action.auth && action.auth !== 'reserved').length
  return {
    version: graph.version,
    project: graph.project,
    counts: {
      pages: graph.pages.length,
      sections: sectionCount,
      entities: graph.entities.length,
      fields: fieldCount,
      actions: graph.actions.length,
      workflows: graph.workflows.length,
      integrations: graph.integrations.length,
      planned_files: Object.keys(files || {}).length,
    },
    diagnostics: {
      errors: diagnostics.errors.length,
      warnings: diagnostics.warnings.length,
      codes: diagnostics.toJSON().map((item) => item.code),
    },
    quality: {
      protected_pages: protectedPages,
      protected_actions: protectedActions,
      dashboard_pages: graph.pages.filter((page) => page.layout === 'dashboard').length,
      public_dashboard_pages: graph.pages.filter((page) => page.layout === 'dashboard' && !page.auth).length,
      multi_tenant: graph.tenancy?.enabled === true,
    },
  }
}

function securitySummary(graph, diagnostics) {
  const findings = []
  for (const page of graph.pages) {
    if (page.layout === 'dashboard' && !page.auth) {
      findings.push({ severity: 'warning', code: 'SEC_PUBLIC_DASHBOARD', message: `Dashboard page "${page.id}" is public.` })
    }
  }
  for (const action of graph.actions) {
    if (['create_record', 'update_record', 'delete_record'].includes(action.type) && !action.auth) {
      findings.push({ severity: 'warning', code: 'SEC_PUBLIC_MUTATION', message: `Mutating action "${action.id}" has no auth policy.` })
    }
  }
  const auth = graph.auth
  if (auth && typeof auth === 'object') {
    for (const user of auth.users || []) {
      if (!String(user.password || '').startsWith('env:')) {
        findings.push({ severity: 'error', code: 'SEC_INLINE_PASSWORD', message: `Auth user "${user.id}" password is not env-backed.` })
      }
    }
  }
  for (const diagnostic of diagnostics.toJSON()) {
    if (['E2504', 'E2406'].includes(diagnostic.code)) {
      findings.push({ severity: 'error', code: `SEC_${diagnostic.code}`, message: diagnostic.message })
    }
  }
  return {
    project: graph.project,
    status: findings.some((f) => f.severity === 'error') ? 'fail' : findings.length ? 'warn' : 'pass',
    findings,
  }
}

function sampleIntent({ id, name, target }) {
  return `version: 0.1

project:
  id: ${id}
  name: ${name}
  target: ${target}

theme:
  preset: minimal
  radius: md
  density: comfortable
  color: neutral

navigation:
  logo: ${name}
  items:
    - label: Home
      href: /
    - label: Contact
      href: "#lead_form"
    - label: Leads
      href: /dashboard/leads

entities:
  - id: Lead
    table: leads
    fields:
      - id: name
        type: string
        label: Name
        required: true
      - id: email
        type: string
        label: Email
        required: true
      - id: message
        type: text
        label: Message
        required: false
      - id: status
        type: enum
        values: [new, contacted, closed]
        default: new

actions:
  - id: create_lead
    type: create_record
    entity: Lead
  - id: list_leads
    type: list_records
    entity: Lead

pages:
  - id: home
    path: /
    layout: landing
    sections:
      - id: hero
        type: hero
        title: ${name}
        subtitle: Generated from one intent file.
        actions:
          - label: Contact
            kind: primary
            target: "#lead_form"
      - id: lead_form
        type: form
        title: Contact
        entity: Lead
        fields: [name, email, message]
        submit:
          action: create_lead
          success_message: Thanks. We will contact you soon.
      - id: footer
        type: footer
        text: Generated by IntentStack.

  - id: dashboard_leads
    path: /dashboard/leads
    layout: dashboard
    title: Leads
    sections:
      - id: leads_table
        type: table
        entity: Lead
        source:
          action: list_leads
        columns: [name, email, status]
`
}

main().catch((e) => { console.error(e); process.exit(2) })
