import { dirname, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
import { parseIntentFile } from '../parse.js'
import { writeIntentProject } from '../intent_loader.js'
import { normalize } from '../normalize.js'
import { validate } from '../validate.js'
import { buildGraph } from '../graph.js'
import { emit, getAdapter, planFiles } from '../emit/index.js'
import { formatGeneratedFiles, verifyGeneratedApp } from '../pipeline.js'
import { applyPatch, formatPatchConflicts, semanticPatchDiff } from '../patch.js'
import { diffPlannedFileSets, diffPlannedFiles, formatDiff } from '../diff.js'
import { loadAst } from './context.js'
import { appendPatchHistory, formatPlannedForDiff, report } from './history.js'

export async function runCheckBuild(ctx, projectDir, cfg, cmd) {
  const { intentPath, ast } = await loadAst(ctx, projectDir, cfg)
  const coreAst = normalize(ast)
  const outDir = resolve(projectDir, ctx.flag('out', cfg.out || 'app'))
  const d = validate(coreAst, { projectDir, outDir })
  console.log(`\nIntentStack ${cmd} - ${intentPath}`)
  console.log(`Target: ${ast?.project?.target ?? '(none)'}\n`)
  console.log('Normalize: ok')
  console.log('Diagnostics:')
  console.log(d.format())
  if (ctx.has('--json')) console.log('\nJSON diagnostics:\n' + JSON.stringify(d.toJSON(), null, 2))
  if (d.hasErrors()) {
    console.error(`\nx ${d.errors.length} error(s). ${cmd === 'build' ? 'Build aborted - no files written.' : 'check failed.'}`)
    process.exit(1)
  }
  if (cmd === 'check') {
    console.log(`\nok check passed (${d.warnings.length} warning(s)).`)
    return
  }
  const graph = buildGraph(coreAst)
  const only = ctx.flag('only', null)
  const written = emit(graph, outDir, {
    clean: !only,
    only,
    cache: ctx.has('--cache') || cfg.emit?.cache === true,
  })
  const format = formatGeneratedFiles(outDir, written, { enabled: !ctx.has('--no-format') })
  const verify = verifyGeneratedApp(outDir, {
    enabled: !ctx.has('--no-verify'),
    install: ctx.has('--verify-install'),
  })
  report(written, outDir, d, coreAst, { format, verify })
  if (format.some((row) => row.status === 'failed')) process.exit(1)
  if (verify.status === 'failed') process.exit(1)
}

export async function runApply(ctx, projectDir, cfg) {
  const { intentPath, ast } = await loadAst(ctx, projectDir, cfg)
  const patchArg = (ctx.args[1] && !ctx.args[1].startsWith('--')) ? ctx.args[1] : ctx.flag('patch', null)
  if (!patchArg) {
    console.error('Usage: intentstack apply <patch.yaml> [--write] [--out-intent FILE]')
    process.exit(2)
  }
  let patchDoc
  try { patchDoc = await parseIntentFile(resolve(patchArg)) }
  catch (e) {
    console.error(`[E1000] Parse error in ${patchArg}: ${e.message}`)
    process.exit(2)
  }
  const beforeCoreAst = normalize(ast)
  const { changes, errors, conflicts } = applyPatch(ast, patchDoc)
  console.log(`\nIntentStack apply - ${patchArg}`)
  if (errors.length) {
    console.error('\nPatch errors:')
    for (const e of errors) console.error('  - ' + e)
    const explanation = formatPatchConflicts(conflicts)
    if (explanation) console.error(explanation)
    process.exit(1)
  }
  console.log('\nSemantic diff:')
  if (changes.length === 0) console.log('  (no changes)')
  for (const c of changes) {
    if (c.before !== undefined) console.log(`  ~ ${c.summary}\n      old: ${JSON.stringify(c.before)}\n      new: ${JSON.stringify(c.after)}`)
    else console.log(`  + ${c.summary}`)
  }
  const coreAst = normalize(ast)
  const d = validate(coreAst, { projectDir, outDir: resolve(projectDir, ctx.flag('out', cfg.out || 'app')) })
  console.log('\nValidation of patched intent:')
  console.log(d.format())
  if (d.hasErrors()) {
    console.error(`\nx patch would introduce ${d.errors.length} error(s) - NOT written.`)
    process.exit(1)
  }
  if (ctx.has('--file-diff')) {
    const beforeFiles = planFiles(buildGraph(beforeCoreAst))
    const afterFiles = planFiles(buildGraph(coreAst))
    console.log('\nGenerated file diff:')
    console.log(formatDiff(diffPlannedFileSets(beforeFiles, afterFiles), { verbose: ctx.has('--verbose') }))
  }
  if (ctx.has('--write')) {
    const outIntent = ctx.flag('out-intent', intentPath)
    const written = await writeIntentProject(ast, outIntent, { singleFile: outIntent !== intentPath })
    appendPatchHistory(outIntent, patchArg, changes)
    console.log(`\nok patched intent written -> ${outIntent}`)
    if (ast.__intentstack?.modular && outIntent === intentPath) console.log(`   modules updated: ${written.length}`)
  } else {
    console.log('\n(dry run - add --write to persist, or --out-intent FILE to write a copy)')
  }
}

export async function runPlan(ctx, projectDir, cfg) {
  const { ast } = await loadAst(ctx, projectDir, cfg)
  const coreAst = normalize(ast)
  const d = validate(coreAst, { projectDir, outDir: resolve(projectDir, ctx.flag('out', cfg.out || 'app')) })
  if (d.hasErrors()) {
    console.log(d.format())
    process.exit(1)
  }
  const files = planFiles(buildGraph(coreAst))
  console.log('Planned files:')
  for (const f of Object.keys(files).sort()) console.log('  + ' + f)
}

export async function runDiff(ctx, projectDir, cfg) {
  const { intentPath, ast } = await loadAst(ctx, projectDir, cfg)
  const coreAst = normalize(ast)
  if (ctx.has('--semantic')) {
    const targetIntent = ctx.flag('to-intent', ctx.flag('to', null))
    if (!targetIntent) {
      console.error('Usage: intentstack diff --semantic --to-intent <intent.yaml>')
      process.exit(2)
    }
    const nextAst = normalize(await parseIntentFile(resolve(targetIntent)))
    const patch = semanticPatchDiff(coreAst, nextAst)
    if (ctx.has('--json')) console.log(JSON.stringify(patch, null, 2))
    else console.log(await yamlDump(patch))
    return
  }
  const d = validate(coreAst, { projectDir, outDir: resolve(projectDir, ctx.flag('out', cfg.out || 'app')) })
  if (d.hasErrors()) {
    console.log(d.format())
    process.exit(1)
  }
  const graph = buildGraph(coreAst)
  const outDir = resolve(projectDir, ctx.flag('out', cfg.out || 'app'))
  const files = formatPlannedForDiff(planFiles(graph), outDir)
  const adapter = getAdapter(graph)
  const diff = diffPlannedFiles(files, outDir, adapter.managedZones || [])
  console.log(`\nIntentStack diff - ${intentPath}`)
  console.log(`Output: ${outDir}\n`)
  console.log(formatDiff(diff, { verbose: ctx.has('--verbose') }))
  if (!diff.hasChanges) console.log('\nok generated output matches current plan.')
}

async function yamlDump(doc) {
  const mod = await import('js-yaml')
  const YAML = mod.default ?? mod
  return YAML.dump(doc, { lineWidth: 100, noRefs: true })
}

export async function runDoctor(ctx, projectDir, cfg) {
  const { intentPath, ast } = await loadAst(ctx, projectDir, cfg)
  const coreAst = normalize(ast)
  const d = validate(coreAst, { projectDir, outDir: resolve(projectDir, ctx.flag('out', cfg.out || 'app')) })
  const graph = buildGraph(coreAst)
  console.log(`\nIntentStack doctor - ${projectDir}`)
  console.log(`Node: ${process.version}`)
  console.log(`Intent: ${intentPath}`)
  console.log(`Target: ${ast?.project?.target ?? '(none)'}`)
  console.log('\nDiagnostics:')
  console.log(d.format())
  if (d.hasErrors()) {
    console.error(`\nx doctor found ${d.errors.length} blocking error(s).`)
    process.exit(1)
  }
  const files = planFiles(graph)
  console.log(`\nPlan: ${Object.keys(files).length} files`)
  const adapter = getAdapter(graph)
  console.log(`Managed zones: ${(adapter.managedZones || []).join(', ') || '(none)'}`)
  console.log('\nok doctor passed.')
}
