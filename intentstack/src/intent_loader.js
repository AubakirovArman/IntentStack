import { assembleIntent, attachMetadata, emptyAst } from './intent_loader/state.js'
import { findIntent, loadIntentProject } from './intent_loader/index.js'
import { assembleIntentDoc, assembleWithMetadata, writeIntentProject } from './intent_loader/index.js'

export { assembleIntent, assembleIntentDoc, assembleWithMetadata, attachMetadata, emptyAst }
export { findIntent, loadIntentProject, writeIntentProject }

export async function writeIntentProjectSafe(ast, intentPath, opts = {}) {
  const { writeIntentProject } = await import('./intent_loader/index.js')
  return writeIntentProject(ast, intentPath, opts)
}
