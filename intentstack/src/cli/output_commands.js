import { dirname, join, resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { buildGraph } from '../graph.js'
import { deploymentPlan } from '../deploy.js'
import { emit, planFiles } from '../emit/index.js'
import { formatOpenApi, generateOpenApi, openApiFormat } from '../openapi.js'
import { formatGeneratedFiles, verifyGeneratedApp } from '../pipeline.js'
import { generateTestFiles } from '../testgen.js'
import { normalize } from '../normalize.js'
import { validate } from '../validate.js'
import { migrateIntent } from '../intent_migrations.js'
import { writeIntentProject } from '../intent_loader.js'
import { loadAst } from './context.js'
import { securitySummary, statsSummary } from './summaries.js'

export async function runOpenApi(ctx, projectDir, cfg) {
  const { ast } = await loadAst(ctx, projectDir, cfg)
  const coreAst = normalize(ast)
  const d = validate(coreAst, { projectDir, outDir: resolve(projectDir, cfg.out || 'app') })
  if (d.hasErrors()) {
    console.log(d.format())
    process.exit(1)
  }
  const spec = generateOpenApi(buildGraph(coreAst))
  const out = ctx.flag('out', null)
  const format = openApiFormat({ out, yaml: ctx.has('--yaml') })
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
}

export async function runTestgen(ctx, projectDir, cfg) {
  const { ast } = await loadAst(ctx, projectDir, cfg)
  const coreAst = normalize(ast)
  const d = validate(coreAst, { projectDir, outDir: resolve(projectDir, cfg.out || 'app') })
  if (d.hasErrors()) {
    console.log(d.format())
    process.exit(1)
  }
  const outDir = resolve(projectDir, ctx.flag('out', 'tests/generated'))
  const files = generateTestFiles(buildGraph(coreAst))
  for (const [rel, content] of Object.entries(files)) {
    const outPath = join(outDir, rel)
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, content)
  }
  console.log(`ok generated tests written -> ${outDir}`)
  for (const file of Object.keys(files).sort()) console.log(`  + ${file}`)
}

export async function runDeploy(ctx, projectDir, cfg) {
  const platform = ctx.flag('platform', (ctx.args[1] && !ctx.args[1].startsWith('--')) ? ctx.args[1] : null)
  if (!platform) {
    console.error('Usage: intentstack deploy --platform vercel|netlify|render [--project DIR] [--out DIR] [--dry-run] [--no-build] [--execute] [--command CMD]')
    process.exit(2)
  }
  const { intentPath, ast } = await loadAst(ctx, projectDir, cfg)
  const coreAst = normalize(ast)
  const outDir = resolve(projectDir, ctx.flag('out', cfg.out || 'app'))
  const d = validate(coreAst, { projectDir, outDir })
  if (d.hasErrors()) {
    console.log(d.format())
    process.exit(1)
  }
  const graph = buildGraph(coreAst)
  let plan
  try { plan = deploymentPlan(graph, platform) }
  catch (e) {
    console.error(e.message)
    process.exit(2)
  }
  const deployCommand = ctx.flag('command', plan.command)
  console.log(`\nIntentStack deploy - ${intentPath}`)
  console.log(`Platform: ${plan.platform}`)
  console.log(`Output app: ${outDir}`)
  console.log(`Command: ${deployCommand}`)
  for (const warning of plan.warnings) console.log(`Warning: ${warning}`)
  console.log('\nDeployment files:')
  for (const file of Object.keys(plan.files).sort()) console.log(`  + ${file}`)
  if (ctx.has('--dry-run')) {
    console.log('\n(dry run - remove --dry-run to write deployment files)')
    return
  }
  if (!ctx.has('--no-build')) prepareDeploymentApp(ctx, graph, outDir)
  for (const [rel, content] of Object.entries(plan.files)) {
    const outPath = join(outDir, rel)
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, content)
  }
  console.log(`ok deployment files written -> ${outDir}`)
  if (ctx.has('--execute')) {
    const result = executeDeploymentCommand(deployCommand, outDir)
    if (result.status !== 0) process.exit(result.status || 1)
  } else {
    console.log(`Next: cd ${outDir} && ${deployCommand}`)
  }
}

export async function runStats(ctx, projectDir, cfg) {
  const { intentPath, ast } = await loadAst(ctx, projectDir, cfg)
  const coreAst = normalize(ast)
  const d = validate(coreAst, { projectDir, outDir: resolve(projectDir, ctx.flag('out', cfg.out || 'app')) })
  const graph = buildGraph(coreAst)
  const data = statsSummary(graph, d, d.hasErrors() ? {} : planFiles(graph))
  const statsOut = ctx.flag('out-stats', ctx.flag('out-json', null))
  if (statsOut) {
    const outPath = resolve(statsOut)
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n')
    console.log(`ok stats written -> ${outPath}`)
    return
  }
  if (ctx.has('--json')) console.log(JSON.stringify(data, null, 2))
  else {
    console.log(`\nIntentStack stats - ${intentPath}`)
    console.log(`Project: ${data.project.id} (${data.project.target})`)
    console.log(`Pages: ${data.counts.pages}   Sections: ${data.counts.sections}   Entities: ${data.counts.entities}   Actions: ${data.counts.actions}`)
    console.log(`Workflows: ${data.counts.workflows}   Integrations: ${data.counts.integrations}   Planned files: ${data.counts.planned_files}`)
    console.log(`Diagnostics: ${data.diagnostics.errors} error(s), ${data.diagnostics.warnings} warning(s)`)
  }
  if (d.hasErrors()) process.exit(1)
}

export async function runSecurity(ctx, projectDir, cfg) {
  const { intentPath, ast } = await loadAst(ctx, projectDir, cfg)
  const coreAst = normalize(ast)
  const d = validate(coreAst, { projectDir, outDir: resolve(projectDir, ctx.flag('out', cfg.out || 'app')) })
  const data = securitySummary(buildGraph(coreAst), d)
  if (ctx.has('--json')) console.log(JSON.stringify(data, null, 2))
  else {
    console.log(`\nIntentStack security - ${intentPath}`)
    for (const item of data.findings) console.log(`  [${item.severity}] ${item.code}: ${item.message}`)
    if (data.findings.length === 0) console.log('  ok no security findings')
  }
  if (d.hasErrors() || (ctx.has('--strict') && data.findings.length > 0)) process.exit(1)
}

export async function runMigrate(ctx, projectDir, cfg) {
  const { intentPath, ast } = await loadAst(ctx, projectDir, cfg)
  const from = ctx.flag('from', String(ast.version ?? '0.1'))
  const to = ctx.flag('to', '0.1')
  let result
  try {
    result = migrateIntent(ast, { from, to })
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
  if (ctx.has('--json')) {
    console.log(JSON.stringify({ from: result.from, to: result.to, changes: result.changes, intent: result.ast }, null, 2))
    return
  }
  console.log(`\nIntentStack migrate - ${intentPath}`)
  if (result.changes.length === 0) console.log(`No migration needed: DSL is already ${result.to}.`)
  else for (const change of result.changes) console.log(`  + ${change}`)
  if (ctx.has('--write')) {
    const outIntent = ctx.flag('out-intent', intentPath)
    await writeIntentProject(result.ast, outIntent, { singleFile: outIntent !== intentPath })
    console.log(`ok migrated intent written -> ${outIntent}`)
  } else {
    console.log('\n(dry run - add --write to persist, or --out-intent FILE to write a copy)')
  }
}

function prepareDeploymentApp(ctx, graph, outDir) {
  const written = emit(graph, outDir)
  const format = formatGeneratedFiles(outDir, written, { enabled: !ctx.has('--no-format') })
  const verify = verifyGeneratedApp(outDir, {
    enabled: !ctx.has('--no-verify'),
    install: ctx.has('--verify-install'),
  })
  if (format.some((row) => row.status === 'failed')) process.exit(1)
  if (verify.status === 'failed') process.exit(1)
  console.log(`\nok generated app prepared (${written.length} files).`)
}

function executeDeploymentCommand(command, cwd) {
  console.log(`\nExecuting deployment command in ${cwd}`)
  console.log(`$ ${command}`)
  const res = spawnSync(command, { cwd, shell: true, encoding: 'utf8', stdio: 'pipe' })
  if (res.stdout) process.stdout.write(res.stdout)
  if (res.stderr) process.stderr.write(res.stderr)
  if (res.error) {
    console.error(`deployment command failed to start: ${res.error.message}`)
    return { status: 1 }
  }
  const status = res.status ?? 1
  console.log(`deployment command exit code: ${status}`)
  return { status }
}
