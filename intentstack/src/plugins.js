import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import YAML from 'js-yaml'
import { ADAPTERS } from './targets/index.js'
import { FIELD_TYPES, TARGETS } from './registry.js'

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
  return loaded
}

function pluginTargets(cfg) {
  const value = cfg.plugins?.targets || cfg.plugin_targets || []
  return Array.isArray(value) ? value : []
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
