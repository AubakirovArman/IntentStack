import { dirname, resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { FIELD_TYPES, TARGETS } from '../registry.js'
import { DOMAIN_MODULES } from '../modules.js'
import { intentSchema } from '../schema.js'
import { patchCatalog, patchOps, patchSchema } from '../patch.js'
import { listThemePacks } from '../themes.js'
import { warningCatalog } from '../diagnostics/catalog.js'

export function runListCapabilities(ctx) {
  const target = ctx.flag('target', null)
  const targets = target ? { [target]: TARGETS[target] } : TARGETS
  if (target && !TARGETS[target]) {
    console.error(`Unknown target "${target}". Available: ${Object.keys(TARGETS).join(', ')}`)
    process.exit(2)
  }
  const data = {
    targets,
    field_types: FIELD_TYPES,
    patch_ops: patchOps(),
    patch_catalog: patchCatalog(),
    patch_schema: patchSchema(),
    domain_modules: DOMAIN_MODULES,
    theme_packs: listThemePacks(),
    warning_catalog: warningCatalog(),
  }
  if (ctx.has('--json')) console.log(JSON.stringify(data, null, 2))
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
    console.log('\nWarning catalog:')
    for (const [code, rule] of Object.entries(data.warning_catalog)) console.log(`  ${code}: ${rule.rule_id}`)
  }
}

export function runSchema(ctx) {
  const schema = intentSchema()
  const out = ctx.flag('out', null)
  if (out) {
    const p = resolve(out)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, JSON.stringify(schema, null, 2) + '\n')
    console.log(`ok schema written -> ${p}`)
  } else {
    console.log(JSON.stringify(schema, null, 2))
  }
}

export function explain(ast, path) {
  if (!path) {
    console.log('Usage: intentstack explain page.<id>.section.<id>')
    return
  }
  const target = TARGETS[ast?.project?.target]
  let found
  for (const p of ast.pages || []) {
    for (const s of p.sections || []) {
      const canon = `page.${p.id}.section.${s.id}`
      if (path === canon || path === `${p.id}.${s.id}`) found = { p, s }
    }
  }
  console.log(`\nexplain ${path}`)
  if (!found) {
    console.log('  (no matching section)')
    return
  }
  const { p, s } = found
  console.log(`  section "${s.id}"  type=${s.type}  on page "${p.id}" (${p.path})`)
  console.log(`  rendered by: target_${ast.project.target}::${s.type}`)
  console.log(`  supported:   ${target?.supported_components?.includes(s.type) ? 'yes' : 'NO'}`)
}

export function help() {
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
    '                      [--only GLOB] [--cache] [--no-format] [--no-verify] [--verify-install]',
    '  intentstack new     <dir> [--target T] [--name NAME] [--single-file] create a modular intent project',
    '  intentstack apply   <patch.yaml> [--write] [--out-intent F]     apply a semantic patch',
    '  intentstack split   [--project DIR] [--write]                  split monolith intent into modules',
    '  intentstack plan    [--project DIR]                             list planned files',
    '  intentstack diff    [--project DIR] [--out DIR] [--verbose]      compare planned files to disk',
    '  intentstack diff    --semantic --to-intent FILE [--json]         emit minimal semantic patch diff',
    '  intentstack explain page.<id>.section.<id>                      show how a node compiles',
    '  intentstack doctor  [--project DIR]                             validate environment and plan',
    '  intentstack graph   [--project DIR] [--json|--html FILE]        print/export Core IR graph',
    '  intentstack collab  [--project DIR] [--base REF] [--incoming REF] [--json]',
    '                                                                  inspect git/module owner changes',
    '  intentstack suggest [--project DIR] [--json] [--limit N]         suggest semantic patch templates',
    '  intentstack autocomplete [--project DIR] [--prefix TEXT] [--json] complete DSL ids/types/patch ops',
    '  intentstack voice   "add pricing section" [--json]              convert voice/text intent to patch',
    '  intentstack editor  [--project DIR] [--out FILE|--serve]         export or serve visual patch editor',
    '  intentstack openapi [--project DIR] [--out FILE] [--yaml]        print/export OpenAPI spec',
    '  intentstack testgen [--project DIR] [--out DIR]                  generate API contract + Playwright E2E tests',
    '  intentstack deploy  --platform P [--project DIR] [--out DIR]     prepare deploy config',
    '  intentstack themes  [--json|--apply PRESET --write]              list/apply theme packs',
    '  intentstack marketplace [--json] [--kind K]                      list local extensions',
    '  intentstack marketplace install <manifest> [--write]             install/pin local plugin',
    '  intentstack stats   [--project DIR] [--json] [--out-stats FILE]  print app/compiler metrics',
    '  intentstack security [--project DIR] [--json] [--strict]          audit security posture',
    '  intentstack docs    [--project DIR] [--out DIR]                  generate static docs site',
    '  intentstack migrate [--project DIR] [--from V] [--to V] [--write] migrate DSL versions',
    '  intentstack list_capabilities [--target T] [--json]              print targets and patch ops',
    '  intentstack schema  [--out FILE]                                 print JSON Schema for DSL v0.1',
    '  intentstack verify  [--examples DIR] [--targets A,B] [--npm-build] verify examples x targets',
  ]
  console.log(lines.join('\n'))
}
