import { dirname, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { parseIntentFile } from '../parse.js'
import { assembleIntent, attachMetadata, emptyAst } from './state.js'
import { writeIntentProject } from './writer.js'
import { stripIncludes } from './utils.js'

export async function findIntent(projectDir, cfgIntent) {
  const candidates = [cfgIntent, 'intent/app.intent.yaml', 'intent/app.intent.yml', 'intent/app.intent.json', 'app.intent.yaml'].filter(Boolean)
  for (const c of candidates) {
    const p = resolve(projectDir, c)
    if (existsSync(p)) return p
  }
  return null
}

export async function loadIntentProject(projectDir, cfg = {}, opts = {}) {
  const intentPath = opts.intentPath || (opts.intentArg ? resolve(opts.intentArg) : await findIntent(projectDir, cfg.intent))
  if (!intentPath || !existsSync(intentPath)) {
    throw new Error(`No intent file found in ${projectDir}/intent/. Pass --intent <path>.`)
  }
  const root = await parseIntentFile(intentPath)
  const ast = await assembleIntent(root || {}, intentPath)
  if (opts.targetOverride) ast.project = { ...(ast.project || {}), target: opts.targetOverride }
  return { intentPath, ast }
}

export async function assembleIntentDoc(root, rootPath) {
  return assembleIntent(root, rootPath)
}

export async function writeIntentProjectSafe(ast, intentPath, opts = {}) {
  const attach = ast?.__intentstack && ast.__intentstack.pathFiles
  if (!attach) {
    throw new Error('Cannot persist intent without assembled metadata. Load via loadIntentProject first.')
  }
  return writeIntentProject(ast, intentPath, opts)
}

export function assembleWithMetadata(root, rootPath) {
  const assembled = root
  attachMetadata(assembled, {
    modular: false,
    rootPath,
    sourceFiles: [rootPath],
    owners: {},
    pathFiles: { version: rootPath, project: rootPath, theme: rootPath, navigation: rootPath, auth: rootPath },
  })
  return assembled
}

export { writeIntentProject, assembleIntent, attachMetadata, emptyAst, stripIncludes }
