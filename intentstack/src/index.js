#!/usr/bin/env node
// IntentStack v0.1 CLI - reference implementation.
// Pipeline (PRD 17): load -> parse -> normalize -> validate -> build graph -> plan -> emit -> format -> verify -> report.
import { loadConfiguredPlugins } from './plugins.js'
import { createCliContext, loadAst, readConfig, resolveCompatPath } from './cli/context.js'
import { runListCapabilities, runSchema, explain, help } from './cli/help.js'
import { runNewCommand } from './cli/scaffold.js'
import { runVerify } from './cli/verify.js'
import { runDocs, runMarketplace, runThemes } from './cli/marketplace_theme_docs.js'
import { runSplit } from './cli/intent_files.js'
import { runApply, runCheckBuild, runDiff, runDoctor, runPlan } from './cli/project_commands.js'
import { runAutocomplete, runCollab, runEditor, runGraph, runSuggest, runVoice } from './cli/graph_commands.js'
import {
  runDeploy,
  runMigrate,
  runOpenApi,
  runSecurity,
  runStats,
  runTestgen,
} from './cli/output_commands.js'
import { normalize } from './normalize.js'

async function main() {
  const ctx = createCliContext()
  const projectArg = ctx.flag('project', '.')
  const projectDir = resolveCompatPath(projectArg, process.cwd())

  if (ctx.cmd === 'new') {
    runNewCommand(ctx)
    return
  }

  const cfg = await readConfig(projectDir)
  try {
    await loadConfiguredPlugins(projectDir, cfg)
  } catch (e) {
    console.error(`[E0900] Plugin load error:\n  ${e.message}`)
    process.exit(2)
  }

  switch (ctx.cmd) {
    case 'list_capabilities':
      runListCapabilities(ctx)
      return
    case 'schema':
      runSchema(ctx)
      return
    case 'verify':
      await runVerify(ctx)
      return
    case 'docs':
      runDocs(ctx, projectDir)
      return
    case 'themes':
      await runThemes(ctx, projectDir, cfg)
      return
    case 'marketplace':
      runMarketplace(ctx, projectDir, cfg)
      return
    case 'split':
      await runSplit(ctx, projectDir, cfg)
      return
    case 'check':
    case 'build':
      await runCheckBuild(ctx, projectDir, cfg, ctx.cmd)
      return
    case 'apply':
      await runApply(ctx, projectDir, cfg)
      return
    case 'plan':
      await runPlan(ctx, projectDir, cfg)
      return
    case 'diff':
      await runDiff(ctx, projectDir, cfg)
      return
    case 'doctor':
      await runDoctor(ctx, projectDir, cfg)
      return
    case 'graph':
      await runGraph(ctx, projectDir, cfg)
      return
    case 'collab':
      await runCollab(ctx, projectDir, cfg)
      return
    case 'suggest':
      await runSuggest(ctx, projectDir, cfg)
      return
    case 'autocomplete':
      await runAutocomplete(ctx, projectDir, cfg)
      return
    case 'voice':
      await runVoice(ctx, projectDir, cfg)
      return
    case 'editor':
      await runEditor(ctx, projectDir, cfg)
      return
    case 'openapi':
      await runOpenApi(ctx, projectDir, cfg)
      return
    case 'testgen':
      await runTestgen(ctx, projectDir, cfg)
      return
    case 'deploy':
      await runDeploy(ctx, projectDir, cfg)
      return
    case 'stats':
      await runStats(ctx, projectDir, cfg)
      return
    case 'security':
      await runSecurity(ctx, projectDir, cfg)
      return
    case 'migrate':
      await runMigrate(ctx, projectDir, cfg)
      return
    case 'explain': {
      const { ast } = await loadAst(ctx, projectDir, cfg)
      explain(normalize(ast), ctx.args[1])
      return
    }
    default:
      help()
  }
}

main().catch((e) => { console.error(e); process.exit(2) })
