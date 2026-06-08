import { existsSync, statSync, readdirSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve as resolvePath } from 'node:path'
import { normalizePath } from './utils.js'

const TRUSTED_INCLUDE_ROOTS = new Set(['shared', 'backend', 'frontend'])

export function expandInclude(rootDir, pattern) {
  const check = validateIncludePattern(rootDir, pattern)
  if (check.error) {
    return { pattern, files: [], searchRoot: rootDir, optional: false, error: check.error }
  }
  const { normalizedPattern, absolutePattern } = check
  if (!normalizedPattern.includes('*')) {
    return existsSync(absolutePattern)
      ? { pattern, files: [absolutePattern], searchRoot: absolutePattern, optional: false }
      : { pattern, files: [], searchRoot: absolutePattern, optional: false, error: `Include "${pattern}" does not exist.` }
  }
  const searchRoot = includeSearchRoot(rootDir, normalizedPattern)
  const files = walkFiles(searchRoot)
  const re = globRegex(absolutePattern)
  return {
    pattern,
    files: files.filter((file) => re.test(normalizePath(file))),
    searchRoot,
    optional: optionalEmptyInclude(pattern),
  }
}

export function validateIncludePattern(rootDir, pattern) {
  if (typeof pattern !== 'string' || pattern.trim() === '') {
    return { error: `Include "${String(pattern)}" must be a non-empty relative path.` }
  }
  if (isAbsolute(pattern)) {
    return { error: `Include "${pattern}" must be relative to the intent root.` }
  }
  const normalizedPattern = normalizePath(pattern).replace(/^\.\//, '')
  const parts = normalizedPattern.split('/').filter(Boolean)
  if (parts.includes('..')) {
    return { error: `Include "${pattern}" cannot contain ".." path traversal.` }
  }
  if (!TRUSTED_INCLUDE_ROOTS.has(parts[0])) {
    return { error: `Include "${pattern}" must be under shared/, backend/, or frontend/.` }
  }
  const absolutePattern = resolvePath(rootDir, normalizedPattern)
  const rel = normalizePath(relative(resolvePath(rootDir), absolutePattern))
  if (rel === '..' || rel.startsWith('../')) {
    return { error: `Include "${pattern}" resolves outside the intent root.` }
  }
  return { normalizedPattern, absolutePattern: normalizePath(absolutePattern) }
}

export function optionalEmptyInclude(pattern) {
  const p = normalizePath(pattern).replace(/^\.\//, '')
  return [
    'backend/workflows/*.yaml',
    'backend/workflows/*.yml',
    'backend/workflows/**/*.yaml',
    'backend/workflows/**/*.yml',
    'backend/integrations/*.yaml',
    'backend/integrations/*.yml',
    'backend/integrations/**/*.yaml',
    'backend/integrations/**/*.yml',
  ].includes(p)
}

function includeSearchRoot(rootDir, pattern) {
  const parts = normalizePath(pattern).split('/')
  const rootParts = []
  for (const part of parts) {
    if (part.includes('*')) break
    rootParts.push(part)
  }
  const p = resolvePath(rootDir, rootParts.join('/'))
  return existsSync(p) && statSync(p).isDirectory() ? p : dirname(p)
}

function walkFiles(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const p = resolvePath(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkFiles(p))
    else if (entry.isFile()) out.push(p)
  }
  return out
}

function globRegex(pattern) {
  let out = '^'
  const chars = normalizePath(pattern)
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]
    if (c === '*') {
      if (chars[i + 1] === '*') {
        out += '.*'
        i += 1
      } else {
        out += '[^/]*'
      }
    } else {
      out += escapeRegex(c)
    }
  }
  return new RegExp(out + '$')
}

function escapeRegex(c) {
  return /[\\^$+?.()|[\]{}]/.test(c) ? `\\${c}` : c
}
