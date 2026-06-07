import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { validate } from '../src/validate.js'
import { buildGraph } from '../src/graph.js'
import { planFiles } from '../src/emit/index.js'

function ast(source = 'src/custom/components/RoiCalculator.tsx') {
  return {
    version: 0.1,
    project: { id: 'custom_test', name: 'Custom Test', target: 'web_ts_minimal' },
    pages: [{
      id: 'home',
      path: '/',
      sections: [{
        id: 'roi',
        type: 'custom_component',
        component: 'RoiCalculator',
        source,
      }],
    }],
  }
}

function astWithProps() {
  const next = ast()
  next.pages[0].sections[0].props = { initialValue: 12, label: 'ROI' }
  next.pages[0].sections[0].props_schema = {
    initialValue: { type: 'number', required: true },
    label: 'string',
  }
  return next
}

test('custom_component validates source file and named export when outDir is provided', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-custom-'))
  try {
    const missing = validate(ast(), { outDir: dir })
    assert.equal(missing.hasErrors(), true)
    assert.equal(missing.errors[0].code, 'E2302')

    mkdirSync(join(dir, 'src/custom/components'), { recursive: true })
    writeFileSync(join(dir, 'src/custom/components/RoiCalculator.tsx'), 'export function RoiCalculator() { return null }\n')
    const ok = validate(ast(), { outDir: dir })
    assert.equal(ok.hasErrors(), false, ok.format())
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('custom_component rejects unsafe source paths and component names', () => {
  const outside = validate(ast('../secrets/RoiCalculator.tsx'))
  assert.ok(outside.errors.some((e) => e.code === 'E2310'))

  const generated = validate(ast('src/generated/RoiCalculator.tsx'))
  assert.ok(generated.errors.some((e) => e.code === 'E2311'))

  const badExt = validate(ast('src/custom/components/RoiCalculator.txt'))
  assert.ok(badExt.errors.some((e) => e.code === 'E2312'))

  const badName = ast()
  badName.pages[0].sections[0].component = 'Roi-Calculator'
  const badNameDiagnostics = validate(badName)
  assert.ok(badNameDiagnostics.errors.some((e) => e.code === 'E2309'))
})

test('custom_component rejects unsafe code patterns when source is available', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentstack-custom-safety-'))
  try {
    mkdirSync(join(dir, 'src/custom/components'), { recursive: true })
    writeFileSync(join(dir, 'src/custom/components/RoiCalculator.tsx'), `import { readFileSync } from 'node:fs'
export function RoiCalculator() {
  eval('1 + 1')
  fetch('/api/secrets')
  window.localStorage.setItem('token', 'x')
  return <div dangerouslySetInnerHTML={{ __html: 'unsafe' }} />
}
`)
    const d = validate(ast(), { outDir: dir })
    assert.ok(d.errors.some((e) => e.code === 'E2313'))
    assert.ok(d.errors.some((e) => e.code === 'E2314'))
    assert.ok(d.errors.some((e) => e.code === 'E2315'))
    assert.ok(d.errors.some((e) => e.code === 'E2316'))
    assert.ok(d.errors.some((e) => e.code === 'E2317'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('custom_component emits a generated wrapper that imports custom code', () => {
  const files = planFiles(buildGraph(ast()))
  assert.match(files['src/generated/components/Roi.tsx'], /import \{ RoiCalculator \} from "\.\.\/\.\.\/custom\/components\/RoiCalculator"/)
  assert.match(files['src/generated/components/Roi.tsx'], /return <RoiCalculator \/>/)
})

test('custom_component validates declared props schema and emits props', () => {
  const ok = validate(astWithProps())
  assert.equal(ok.hasErrors(), false, ok.format())

  const files = planFiles(buildGraph(astWithProps()))
  assert.match(files['src/generated/components/Roi.tsx'], /const props = \{/)
  assert.match(files['src/generated/components/Roi.tsx'], /"initialValue": 12/)
  assert.match(files['src/generated/components/Roi.tsx'], /return <RoiCalculator \{\.\.\.props\} \/>/)

  const bad = astWithProps()
  bad.pages[0].sections[0].props.initialValue = '12'
  const d = validate(bad)
  assert.equal(d.hasErrors(), true)
  assert.ok(d.errors.some((e) => e.code === 'E2308'))
})
