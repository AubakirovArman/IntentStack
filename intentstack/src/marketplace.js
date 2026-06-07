import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import YAML from 'js-yaml'

const LOCK_VERSION = 1
const COMPILER_VERSION = '0.1.0'

export function installMarketplacePlugin({ projectDir, cfg = {}, manifestPath, write = false } = {}) {
  if (!manifestPath) throw new Error('marketplace install requires a manifest path.')
  const manifestFile = resolve(projectDir, manifestPath)
  if (!existsSync(manifestFile)) throw new Error(`Marketplace manifest does not exist: ${manifestFile}`)
  const manifest = readManifest(manifestFile)
  const type = manifest.type || manifest.kind
  if (type !== 'target') throw new Error(`Only target plugin manifests are supported for install; got "${type || 'unknown'}".`)
  if (!manifest.id) throw new Error('Marketplace manifest requires id.')
  if (!manifest.version) throw new Error('Marketplace manifest requires version.')
  const requirement = manifest.compatibility?.intentstack || manifest.engines?.intentstack
  if (!isCompatible(requirement)) {
    throw new Error(`Plugin "${manifest.id}" requires IntentStack ${requirement}; current compiler is ${COMPILER_VERSION}.`)
  }
  if (!manifest.module) throw new Error('Target plugin manifest requires module.')
  const sourceModule = resolve(dirname(manifestFile), manifest.module)
  if (!existsSync(sourceModule)) throw new Error(`Target plugin module does not exist: ${sourceModule}`)
  const installDir = join(projectDir, '.intentstack', 'plugins', manifest.id)
  const moduleFile = basename(sourceModule)
  const installedModule = join(installDir, moduleFile)
  const configModule = gitPath(relative(projectDir, installedModule))
  const entry = {
    id: manifest.id,
    version: String(manifest.version),
    module: configModule,
  }
  if (manifest.capabilities) entry.capabilities = manifest.capabilities
  if (manifest.capabilities_file || manifest.capabilitiesFile) {
    const sourceCapabilities = resolve(dirname(manifestFile), manifest.capabilities_file || manifest.capabilitiesFile)
    if (!existsSync(sourceCapabilities)) throw new Error(`Plugin capabilities file does not exist: ${sourceCapabilities}`)
    const capFile = basename(sourceCapabilities)
    entry.capabilities_file = capFile
    if (write) {
      mkdirSync(installDir, { recursive: true })
      copyFileSync(sourceCapabilities, join(installDir, capFile))
    }
  }
  const nextConfig = pluginConfig(cfg, entry)
  const lock = marketplaceLock(projectDir)
  lock.plugins[manifest.id] = {
    id: manifest.id,
    type,
    version: String(manifest.version),
    module: configModule,
    manifest: gitPath(relative(projectDir, manifestFile)),
    installed_at: new Date().toISOString(),
  }
  if (write) {
    mkdirSync(installDir, { recursive: true })
    copyFileSync(sourceModule, installedModule)
    writeFileSync(join(projectDir, 'intentstack.config.yaml'), YAML.dump(nextConfig, { lineWidth: 100, noRefs: true }))
    mkdirSync(join(projectDir, '.intentstack'), { recursive: true })
    writeFileSync(join(projectDir, '.intentstack', 'marketplace-lock.json'), JSON.stringify(lock, null, 2) + '\n')
  }
  return {
    id: manifest.id,
    type,
    version: String(manifest.version),
    module: configModule,
    manifest: gitPath(relative(projectDir, manifestFile)),
    compatibility: requirement || '*',
    written: write,
    config: nextConfig,
    lock,
  }
}

function readManifest(path) {
  const text = readFileSync(path, 'utf8')
  if (path.endsWith('.json')) return JSON.parse(text)
  return YAML.load(text) || {}
}

function pluginConfig(cfg, entry) {
  const next = JSON.parse(JSON.stringify(cfg || {}))
  next.plugins = next.plugins || {}
  const targets = Array.isArray(next.plugins.targets) ? next.plugins.targets : []
  next.plugins.targets = [...targets.filter((item) => item?.id !== entry.id), entry]
  return next
}

function marketplaceLock(projectDir) {
  const path = join(projectDir, '.intentstack', 'marketplace-lock.json')
  if (!existsSync(path)) return { version: LOCK_VERSION, plugins: {} }
  try {
    const lock = JSON.parse(readFileSync(path, 'utf8'))
    return {
      version: lock.version || LOCK_VERSION,
      plugins: lock.plugins || {},
    }
  } catch {
    return { version: LOCK_VERSION, plugins: {} }
  }
}

function isCompatible(requirement) {
  if (!requirement || requirement === '*') return true
  const value = String(requirement).trim()
  return value === COMPILER_VERSION
    || value === '0.1'
    || value === '0.1.x'
    || value === '^0.1.0'
    || value === '>=0.1.0'
}

function gitPath(value) {
  return String(value || '').replace(/\\/g, '/')
}
