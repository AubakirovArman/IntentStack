import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync } from 'node:fs'
import { buildGraph } from '../graph.js'
import { emit } from '../emit/index.js'
import { findIntent, loadIntentProject } from '../intent_loader.js'
import { normalize } from '../normalize.js'
import { runNpm } from '../pipeline.js'
import { TARGETS } from '../registry.js'
import { validate } from '../validate.js'
import { responsiveVisualChecks } from '../visual_checks.js'
import { resolveCompatPath } from './context.js'

export async function runVerify(ctx) {
  const examplesDir = resolveCompatPath(ctx.flag('examples', 'examples'), process.cwd())
  const targets = ctx.flag('targets', Object.keys(TARGETS).join(','))
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  const unknownTarget = targets.find((target) => !TARGETS[target])
  if (unknownTarget) {
    console.error(`Unknown target "${unknownTarget}". Available: ${Object.keys(TARGETS).join(', ')}`)
    process.exit(2)
  }
  const result = await verifyExamples(examplesDir, targets, { npmBuild: ctx.has('--npm-build') })
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
}

export async function verifyExamples(examplesDir, targets, opts = {}) {
  const rows = []
  const entries = existsSync(examplesDir)
    ? readdirSync(examplesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
    : []
  for (const example of entries) {
    const projectDir = join(examplesDir, example)
    const intentPath = await findIntent(projectDir)
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
        const graph = buildGraph(coreAst)
        const written = emit(graph, outDir)
        const visualFindings = responsiveVisualChecks(planFromWritten(outDir, written), target)
        if (visualFindings.length) {
          rows.push({ example, target, ok: false, error: `visual checks failed: ${visualFindings.map((item) => item.code).join(', ')}` })
          continue
        }
        if (opts.npmBuild) {
          const installed = runNpm(outDir, ['install'])
          if (installed.status !== 0) {
            rows.push({ example, target, ok: false, error: `npm install failed: ${installed.error}` })
            continue
          }
          const built = runNpm(outDir, ['run', 'build'])
          if (built.status !== 0) rows.push({ example, target, ok: false, error: `npm run build failed: ${built.error}` })
          else rows.push({ example, target, ok: true, files: written.length })
          continue
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

function planFromWritten(outDir, written) {
  const files = {}
  for (const rel of written) {
    try { files[rel] = readFileSync(join(outDir, rel), 'utf8') } catch { /* ignore unreadable generated file */ }
  }
  return files
}
