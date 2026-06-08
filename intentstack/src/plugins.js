import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import YAML from 'js-yaml'
import { ADAPTERS } from './targets/index.js'
import { FIELD_TYPES, TARGETS } from './registry.js'

const VALIDATOR_HOOKS = new Map()

export async function loadConfiguredPlugins(projectDir, cfg = {}) {
  const targets = pluginTargets(cfg)
  const loaded = []
  for (const entry of targets) {
    if (!entry?.id || !entry?.module) throw new Error('Plugin target entries require id and module.')
    const modulePath = resolve(projectDir, entry.module)
    if (!existsSync(modulePath)) throw new Error(`Plugin target "${entry.id}" module does not exist: ${modulePath}`)
    const mod = await import(pathToFileURL(modulePath).href)
    const adapter = mod.default?.planFiles ? mod.default : mod
    if (typeof adapter.planFiles !== 'function') throw new Error(`Plugin target "${entry.id}" must export planFiles(graph).`)
    ADAPTERS[entry.id] = adapter
    TARGETS[entry.id] = targetCapabilities(entry, mod, adapter, modulePath)
    loaded.push(TARGETS[entry.id])
  }
  for (const entry of pluginValidators(cfg)) {
    if (!entry?.id || !entry?.module) throw new Error('Plugin validator entries require id and module.')
    const modulePath = resolve(projectDir, entry.module)
    if (!existsSync(modulePath)) throw new Error(`Plugin validator "${entry.id}" module does not exist: ${modulePath}`)
    const mod = await import(pathToFileURL(modulePath).href)
    registerValidatorHook(entry.id, validatorFn(entry, mod), modulePath)
  }
  return loaded
}

export function registerValidatorHook(id, validate, modulePath = null) {
  if (typeof validate !== 'function') throw new Error(`Plugin validator "${id}" must export a validate function.`)
  VALIDATOR_HOOKS.set(id, { id, validate, module: modulePath })
}

export function runPluginValidators(ast, diagnostics, opts = {}) {
  for (const hook of VALIDATOR_HOOKS.values()) {
    try {
      const result = hook.validate(ast, validatorContext(hook, diagnostics, opts))
      if (result && typeof result.then === 'function') throw new Error('async validators are not supported')
      if (Array.isArray(result)) for (const item of result) diagnostics.push({ source: hook.id, ...item })
    } catch (e) {
      diagnostics.error('E0901', `Plugin validator "${hook.id}" failed: ${e.message}`, {
        file: hook.module,
        suggestion: 'Fix or disable the validator plugin in intentstack.config.yaml.',
      })
    }
  }
}

function pluginTargets(cfg) {
  const value = cfg.plugins?.targets || cfg.plugin_targets || []
  return Array.isArray(value) ? value : []
}

function pluginValidators(cfg) {
  const value = cfg.plugins?.validators || cfg.plugin_validators || []
  return Array.isArray(value) ? value : []
}

function validatorFn(entry, mod) {
  const fn = mod.validateIntent || mod.validate || mod.default
  if (typeof fn !== 'function') throw new Error(`Plugin validator "${entry.id}" must export validateIntent(), validate(), or a default function.`)
  return fn
}

function validatorContext(hook, diagnostics, opts) {
  return {
    plugin: hook,
    diagnostics,
    opts,
    error: (code, message, extra = {}) => diagnostics.error(code, message, { source: hook.id, ...extra }),
    warn: (code, message, extra = {}) => diagnostics.warn(code, message, { source: hook.id, ...extra }),
    info: (code, message, extra = {}) => diagnostics.info(code, message, { source: hook.id, ...extra }),
  }
}

function targetCapabilities(entry, mod, adapter, modulePath) {
  const caps = entry.capabilities || readCapabilities(entry, modulePath) || mod.capabilities || adapter.capabilities || {}
  return {
    id: entry.id,
    frontend: caps.frontend !== false,
    backend: caps.backend === true,
    database: caps.database === true,
    framework: caps.framework || entry.framework || 'plugin',
    ui: caps.ui || entry.ui || 'custom',
    supported_components: caps.supported_components || caps.components || [],
    supported_actions: caps.supported_actions || caps.actions || [],
    supported_field_types: caps.supported_field_types || caps.field_types || FIELD_TYPES,
    plugin: true,
    version: entry.version,
    module: modulePath,
  }
}

function readCapabilities(entry, modulePath) {
  const file = entry.capabilities_file || entry.capabilitiesFile
  if (!file) return null
  const path = resolve(modulePath, '..', file)
  if (!existsSync(path)) throw new Error(`Plugin capabilities file does not exist: ${path}`)
  return YAML.load(readFileSync(path, 'utf8')) || {}
}
