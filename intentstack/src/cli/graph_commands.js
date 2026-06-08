import { dirname, resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { buildGraph } from '../graph.js'
import { normalize } from '../normalize.js'
import { validate } from '../validate.js'
import { renderGraphHtml } from '../visual_graph.js'
import { collaborationReport, formatCollabReport } from '../collab.js'
import { intentCompletions, intentSuggestions } from '../suggestions.js'
import { voiceToPatch } from '../voice_intent.js'
import { startEditorServer } from '../editor_server.js'
import { loadAst } from './context.js'
import { readPatchHistory } from './history.js'
import { graphSummary } from './summaries.js'

export async function runGraph(ctx, projectDir, cfg) {
  const { intentPath, ast } = await loadAst(ctx, projectDir, cfg)
  const coreAst = normalize(ast)
  const d = validate(coreAst, { projectDir, outDir: resolve(projectDir, ctx.flag('out', cfg.out || 'app')) })
  if (d.hasErrors()) {
    console.log(d.format())
    process.exit(1)
  }
  const graph = buildGraph(coreAst)
  const data = graphSummary(graph)
  if (ctx.has('--normalized')) data.normalized = coreAst
  const htmlOut = ctx.flag('html', null)
  if (htmlOut) {
    const outPath = resolve(htmlOut)
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, renderGraphHtml(data, readPatchHistory(intentPath)))
    console.log(`ok graph HTML written -> ${outPath}`)
    return
  }
  if (ctx.has('--json')) console.log(JSON.stringify(data, null, 2))
  else printGraphSummary(data)
}

export async function runCollab(ctx, projectDir, cfg) {
  const { ast } = await loadAst(ctx, projectDir, cfg)
  const graph = buildGraph(normalize(ast))
  const data = collaborationReport(graph, projectDir, { base: ctx.flag('base', 'HEAD'), incoming: ctx.flag('incoming', null) })
  if (ctx.has('--json')) console.log(JSON.stringify(data, null, 2))
  else console.log('\n' + formatCollabReport(data))
  if (ctx.has('--strict') && data.findings.length > 0) process.exit(1)
}

export async function runSuggest(ctx, projectDir, cfg) {
  const { ast } = await loadAst(ctx, projectDir, cfg)
  const graph = buildGraph(normalize(ast))
  const suggestions = intentSuggestions(graph, { limit: Number(ctx.flag('limit', 6)) || 6 })
  if (ctx.has('--json')) console.log(JSON.stringify({ suggestions }, null, 2))
  else {
    console.log(`\nIntentStack suggestions - ${graph.project?.id || 'app'}\n`)
    for (const item of suggestions) {
      console.log(`${item.id}: ${item.title}`)
      console.log(`  ${item.reason}`)
      console.log(item.yaml.split('\n').map((line) => `  ${line}`).join('\n'))
    }
  }
}

export async function runAutocomplete(ctx, projectDir, cfg) {
  const { ast } = await loadAst(ctx, projectDir, cfg)
  const graph = buildGraph(normalize(ast))
  const completions = intentCompletions(graph, {
    prefix: ctx.flag('prefix', ''),
    limit: Number(ctx.flag('limit', 25)) || 25,
  })
  if (ctx.has('--json')) console.log(JSON.stringify({ completions }, null, 2))
  else {
    console.log(`\nIntentStack autocomplete - ${graph.project?.id || 'app'}\n`)
    for (const item of completions) console.log(`${item.kind}: ${item.label} -> ${item.insert_text.split('\n')[0]}`)
  }
}

export async function runVoice(ctx, projectDir, cfg) {
  const utterance = ctx.flag('text', ctx.args.slice(1).filter((item) => !item.startsWith('--')).join(' '))
  const { ast } = await loadAst(ctx, projectDir, cfg)
  const graph = buildGraph(normalize(ast))
  const data = voiceToPatch(graph, utterance)
  if (ctx.has('--json')) console.log(JSON.stringify(data, null, 2))
  else {
    console.log(`\nIntentStack voice - ${data.summary}\n`)
    console.log(data.yaml)
  }
  if (data.patch.length === 0) process.exitCode = 1
}

export async function runEditor(ctx, projectDir, cfg) {
  if (ctx.has('--serve')) {
    const started = await startEditorServer({
      projectDir,
      cfg,
      outDir: ctx.flag('out', cfg.out || 'app'),
      targetOverride: ctx.flag('target', null),
      port: Number(ctx.flag('port', 4321)),
      host: ctx.flag('host', '127.0.0.1'),
    })
    console.log(`ok visual editor server listening -> http://${started.host}:${started.port}`)
    console.log('Use Ctrl+C to stop. Patches are applied through intent writeback.')
    return
  }
  const { intentPath, ast } = await loadAst(ctx, projectDir, cfg)
  const coreAst = normalize(ast)
  const d = validate(coreAst, { projectDir, outDir: resolve(projectDir, ctx.flag('out', cfg.out || 'app')) })
  if (d.hasErrors()) {
    console.log(d.format())
    process.exit(1)
  }
  const graph = buildGraph(coreAst)
  const outPath = resolve(ctx.flag('out', 'intentstack-editor.html'))
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, renderGraphHtml(graphSummary(graph), readPatchHistory(intentPath)))
  console.log(`ok visual editor written -> ${outPath}`)
  console.log('Open the file in a browser and use Patch Builder for semantic edits, or run editor --serve to apply patches from the UI.')
}

function printGraphSummary(data) {
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
