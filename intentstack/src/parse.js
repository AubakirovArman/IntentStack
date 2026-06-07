// Parse stage: intent file (YAML or JSON) -> raw AST object.
import { readFileSync } from 'node:fs'

export async function parseIntentFile(path) {
  const text = readFileSync(path, 'utf8')
  if (path.endsWith('.json')) return JSON.parse(text)
  const mod = await import('js-yaml') // lazy: only frontend needs a YAML parser
  const YAML = mod.default ?? mod
  return YAML.load(text)
}
