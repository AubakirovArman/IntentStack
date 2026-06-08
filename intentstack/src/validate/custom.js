import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { JS_IDENTIFIER, isPlainObject, isJsonValue, matchesPropType, escapeRegex } from './utils.js'

export function validateCustomComponent(d, sp, s, opts) {
  if (!s.component) {
    d.error('E2300', `Custom component "${s.id}" has no component export name.`, { path: `${sp}.component` })
  } else if (!JS_IDENTIFIER.test(s.component)) {
    d.error('E2309', `Custom component "${s.id}" component export name must be a JavaScript identifier.`, { path: `${sp}.component` })
  }
  validateCustomProps(d, sp, s)
  if (!s.source) {
    d.error('E2301', `Custom component "${s.id}" has no source file.`, { path: `${sp}.source` })
    return
  }
  const source = validateCustomSourcePath(d, sp, s)
  if (!source) return
  const outDir = opts.outDir
  if (!outDir) return
  const abs = join(outDir, ...source.split('/'))
  if (!existsSync(abs)) {
    d.error('E2302', `Custom component source "${s.source}" does not exist.`, { path: `${sp}.source` })
    return
  }
  if (s.component) {
    const code = readFileSync(abs, 'utf8')
    validateCustomSourceCode(d, sp, s, code)
    validateCustomIntegrity(d, sp, s, code)
    const name = escapeRegex(s.component)
    const named = new RegExp(`export\\s+(function|const|class)\\s+${name}\\b`).test(code)
    const listed = new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(code)
    if (!named && !listed) {
      d.error('E2303', `Custom component source "${s.source}" does not export "${s.component}".`, { path: `${sp}.component` })
    }
  }
}

export function validateCustomIntegrity(d, sp, s, code) {
  const integrity = isPlainObject(s.integrity) ? s.integrity : {}
  const expectedHash = s.source_sha256 || integrity.sha256
  const actualHash = createHash('sha256').update(code).digest('hex')
  if (expectedHash && !sameDigest(String(expectedHash).replace(/^sha256[:-]/, ''), actualHash)) {
    d.error('E2318', `Custom component source "${s.source}" does not match declared sha256 integrity.`, { path: `${sp}.integrity.sha256` })
  }
  const signature = integrity.signature || s.source_signature
  if (!signature) return
  const secret = process.env.INTENTSTACK_CUSTOM_COMPONENT_SIGNATURE_SECRET
  if (!secret) {
    d.error('E2319', 'INTENTSTACK_CUSTOM_COMPONENT_SIGNATURE_SECRET is required to verify custom component signatures.', { path: `${sp}.integrity.signature` })
    return
  }
  const actualSignature = createHmac('sha256', secret).update(code).digest('hex')
  if (!sameDigest(String(signature).replace(/^hmac-sha256[:-]/, ''), actualSignature)) {
    d.error('E2319', `Custom component source "${s.source}" signature is invalid.`, { path: `${sp}.integrity.signature` })
  }
}

function sameDigest(left, right) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function validateCustomSourcePath(d, sp, s) {
  if (typeof s.source !== 'string') {
    d.error('E2310', `Custom component "${s.id}" source must be a relative file path.`, { path: `${sp}.source` })
    return null
  }
  const source = s.source.replace(/\\/g, '/')
  const parts = source.split('/').filter(Boolean)
  if (isAbsolute(s.source) || /^[A-Za-z]:\//.test(source) || parts.includes('..')) {
    d.error('E2310', `Custom component "${s.id}" source must stay inside src/custom/.`, { path: `${sp}.source` })
    return null
  }
  if (!source.startsWith('src/custom/')) {
    d.error('E2311', `Custom component "${s.id}" source must be under src/custom/.`, { path: `${sp}.source` })
    return null
  }
  if (!/\.(tsx|ts|jsx|js)$/.test(source)) {
    d.error('E2312', `Custom component "${s.id}" source must be a .tsx, .ts, .jsx, or .js file.`, { path: `${sp}.source` })
    return null
  }
  return source
}

export function validateCustomSourceCode(d, sp, s, code) {
  const forbidden = [
    { code: 'E2313', re: /\beval\s*\(/, message: 'must not call eval().' },
    { code: 'E2313', re: /\bnew\s+Function\b/, message: 'must not construct functions from strings.' },
    { code: 'E2313', re: /\bimport\s*\(/, message: 'must not use dynamic import().' },
    { code: 'E2314', re: /\bdangerouslySetInnerHTML\b/, message: 'must not use dangerouslySetInnerHTML.' },
    { code: 'E2315', re: /from\s+['"](?:node:)?(?:fs|child_process|path|os|crypto|http|https|net|process)['"]/, message: 'must not import Node built-ins.' },
    { code: 'E2316', re: /\b(fetch|XMLHttpRequest|WebSocket)\b/, message: 'must not open network connections; use generated actions/integrations instead.' },
    { code: 'E2317', re: /\b(localStorage|sessionStorage)\b|document\.cookie|\bnavigator\.sendBeacon\b/, message: 'must not access browser storage, cookies, or sendBeacon.' },
  ]
  for (const rule of forbidden) {
    if (rule.re.test(code)) {
      const codeId = typeof rule.code === 'string' ? rule.code : 'E2313'
      d.error(codeId, `Custom component source "${s.source}" ${rule.message}`, { path: `${sp}.source` })
    }
  }
}

export function validateCustomProps(d, sp, s) {
  if (s.props != null && (!isPlainObject(s.props) || !isJsonValue(s.props))) {
    d.error('E2304', `Custom component "${s.id}" props must be a JSON-serializable object.`, { path: `${sp}.props` })
  }
  if (s.props_schema == null) return
  if (!isPlainObject(s.props_schema)) {
    d.error('E2305', `Custom component "${s.id}" props_schema must be an object.`, { path: `${sp}.props_schema` })
    return
  }
  const props = isPlainObject(s.props) ? s.props : {}
  for (const [key, spec] of Object.entries(s.props_schema)) {
    const type = typeof spec === 'string' ? spec : spec?.type
    const required = typeof spec === 'object' && spec?.required === true
    if (!['string', 'number', 'boolean', 'object', 'array'].includes(type)) {
      d.error('E2306', `Custom component "${s.id}" prop "${key}" has unsupported schema type "${type}".`, {
        path: `${sp}.props_schema.${key}`,
        suggestion: 'Supported: string, number, boolean, object, array',
      })
      continue
    }
    if (props[key] == null) {
      if (required) d.error('E2307', `Custom component "${s.id}" missing required prop "${key}".`, { path: `${sp}.props.${key}` })
      continue
    }
    if (!matchesPropType(props[key], type)) {
      d.error('E2308', `Custom component "${s.id}" prop "${key}" must be ${type}.`, { path: `${sp}.props.${key}` })
    }
  }
}
