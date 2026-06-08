import { parseIntentFile } from '../parse.js'
import { expandInclude } from './includes.js'

export async function collectIncludePlan(root, rootPath) {
  const rootDir = rootPath.includes('/')
    ? rootPath.substring(0, rootPath.lastIndexOf('/'))
    : rootPath.substring(0, rootPath.lastIndexOf('\\'))
  const files = new Set()
  const edges = []
  const errors = []
  const unresolvedIncludes = []
  const includeCycles = []
  const seen = new Set([rootPath])

  async function visit(doc, file, stack) {
    const includes = Array.isArray(doc.includes) ? doc.includes : []
    for (const pattern of includes) {
      const result = expandInclude(rootDir, pattern)
      if (result.error) errors.push(result.error)
      if (result.files.length === 0 && !result.optional && !result.error) {
        unresolvedIncludes.push({ pattern: result.pattern, root: result.searchRoot, file })
      }
      const targets = result.files.sort()
      edges.push({ from: file, pattern, to: targets })
      for (const target of targets) {
        if (stack.includes(target)) {
          includeCycles.push([...stack, target])
          continue
        }
        files.add(target)
        if (seen.has(target)) continue
        seen.add(target)
        await visit(await parseIntentFile(target), target, [...stack, target])
      }
    }
  }

  await visit(root, rootPath, [rootPath])
  return { files: [...files].sort(), edges, errors, unresolvedIncludes, includeCycles }
}
