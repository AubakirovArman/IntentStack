import { dirname, join, resolve } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { loadIntentProject } from '../intent_loader.js'

export function createCliContext(args = process.argv.slice(2), cwd = process.cwd()) {
  return {
    args,
    cmd: args[0],
    cwd,
    flag(name, def) {
      const i = args.indexOf(`--${name}`)
      if (i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')) return args[i + 1]
      return def
    },
    has(value) {
      return args.includes(value)
    },
  }
}

export function resolveCompatPath(rawPath, base = process.cwd()) {
  if (!rawPath) return resolve(base, '.')

  const candidates = []
  const baseParent = dirname(base)
  const normalized = rawPath.replace(/[\\/]+/g, '/').replace(/^\.\/+/, '')
  const withoutIntentstackPrefix = normalized.startsWith('intentstack/')
    ? normalized.slice('intentstack/'.length)
    : normalized

  candidates.push(resolve(rawPath))
  if (base !== process.cwd()) candidates.push(resolve(base, rawPath))
  if (base !== baseParent) candidates.push(resolve(baseParent, rawPath))

  if (withoutIntentstackPrefix && withoutIntentstackPrefix !== normalized) {
    candidates.push(resolve(base, withoutIntentstackPrefix))
    candidates.push(resolve(baseParent, withoutIntentstackPrefix))
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  return resolve(base, rawPath)
}

export async function readConfig(dir) {
  const p = join(dir, 'intentstack.config.yaml')
  if (!existsSync(p)) return {}
  try {
    const mod = await import('js-yaml')
    const YAML = mod.default ?? mod
    return YAML.load(readFileSync(p, 'utf8')) || {}
  } catch {
    return {}
  }
}

export async function loadAst(ctx, projectDir, cfg) {
  try {
    return await loadIntentProject(projectDir, cfg, {
      intentArg: ctx.flag('intent', null),
      targetOverride: ctx.flag('target', null),
    })
  } catch (e) {
    console.error(`[E1000] Intent load error:\n  ${e.message}`)
    process.exit(2)
  }
}
