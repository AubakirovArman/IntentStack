import { cloneWithMetadata, commitDraft } from './utils.js'
import { OPS } from './ops/index.js'
import { patchOpCatalog, patchOpSchema } from './catalog.js'
import { TARGETS } from '../registry.js'

export function applyPatch(ast, patchDoc) {
  const ops = patchDoc?.patch || patchDoc?.ops || []
  const preflightIssues = precheckPatchDetailed(ast, ops)
  if (preflightIssues.length) {
    return { ast, changes: [], errors: preflightIssues.map((issue) => issue.text), conflicts: preflightIssues.map((issue) => issue.conflict) }
  }
  const draft = cloneWithMetadata(ast)
  const changes = []
  const errors = []
  const conflicts = []
  ops.forEach((op, idx) => {
    const fn = OPS[op.op]
    if (!fn) {
      pushPatchError(errors, conflicts, ast, op, idx, `unknown op "${op.op}"`, false)
      return
    }
    try {
      changes.push({ op: op.op, ...fn(draft, op) })
    } catch (e) {
      pushPatchError(errors, conflicts, ast, op, idx, e.message)
    }
  })
  if (errors.length === 0) commitDraft(ast, draft)
  else changes.length = 0
  return { ast, changes, errors, conflicts }
}

export function precheckPatch(ast, ops) {
  return precheckPatchDetailed(ast, ops).map((issue) => issue.text)
}

export function precheckPatchDetailed(ast, ops) {
  const target = TARGETS[ast?.project?.target]
  const issues = []
  ops.forEach((op, idx) => {
    if (!OPS[op?.op]) {
      issues.push(patchIssue(ast, op, idx, `unknown op "${op?.op}"`, false))
      return
    }
    if (op.op === 'text.set' && String(op.target || '').endsWith('.id')) {
      issues.push(patchIssue(ast, op, idx, 'id mutations require a dedicated rename operation to update references safely'))
      return
    }
    if (!target) return
    for (const type of componentTypes(op)) {
      if (type && !target.supported_components.includes(type)) {
        issues.push(patchIssue(ast, op, idx, `target "${ast.project.target}" does not support component "${type}"`))
      }
    }
    const actionType = op.op === 'action.create' ? op.type : null
    if (actionType && !target.supported_actions.includes(actionType)) {
      issues.push(patchIssue(ast, op, idx, `target "${ast.project.target}" does not support action type "${actionType}"`))
    }
    const fieldType = op.op === 'entity.field.add' ? op.field?.type : null
    if (fieldType && !target.supported_field_types.includes(fieldType)) {
      issues.push(patchIssue(ast, op, idx, `target "${ast.project.target}" does not support field type "${fieldType}"`))
    }
  })
  return issues
}

export function patchOps() {
  return Object.keys(OPS).sort()
}

export function patchCatalog() {
  return patchOpCatalog(patchOps())
}

export function patchSchema() {
  return patchOpSchema(patchOps())
}

export function formatPatchConflicts(conflicts = []) {
  if (!conflicts.length) return ''
  const lines = ['\nConflict explanations:']
  for (const c of conflicts) {
    lines.push(`  - patch[${c.patch_index}]${c.op ? ` (${c.op})` : ''}: ${c.message}`)
    if (c.file) lines.push(`      file: ${c.file}`)
    if (c.path) lines.push(`      path: ${c.path}`)
    lines.push(`      fix: ${c.suggestion}`)
  }
  return lines.join('\n')
}

export function explainPatchError(ast, op, idx, message) {
  return {
    patch_index: idx,
    op: op?.op || null,
    message,
    file: ownerFileFor(ast, op),
    path: semanticPathFor(op),
    suggestion: suggestionFor(message),
    fix_hint: fixHintFor(message, op),
  }
}

function ownerFileFor(ast, op) {
  const owners = ast?.__intentstack?.owners || {}
  const root = ast?.__intentstack?.rootPath || null
  const path = semanticPathFor(op)
  if (path) {
    const match = path.match(/^(page|section|entity|action|workflow|integration|navigation|project|theme|auth)\.([^.]+)/)
    if (match?.[1] === 'page') return owners.pages?.[match[2]]?.file || root
    if (match?.[1] === 'section') return owners.sections?.[match[2]]?.file || root
    if (match?.[1] === 'entity') return owners.entities?.[match[2]]?.file || root
    if (match?.[1] === 'action') return owners.actions?.[match[2]]?.file || root
    if (match?.[1] === 'workflow') return owners.workflows?.[match[2]]?.file || root
    if (match?.[1] === 'integration') return owners.integrations?.[match[2]]?.file || root
    if (match?.[1]) return owners[match[1]] || root
    return owners[path] || root
  }
  if (op?.op?.startsWith('navigation.')) return owners.navigation || root
  if (op?.op?.startsWith('project.')) return owners.project || root
  return root
}

function semanticPathFor(op) {
  if (!op) return null
  if (op.target) return String(op.target)
  if (typeof op.section === 'string') return `section.${op.section}`
  if (op.op?.startsWith('section.') && op.id) return `section.${op.id}`
  if (op.page) return `page.${op.page}`
  if (op.entity) return `entity.${op.entity}`
  if (op.action) return `action.${op.action}`
  if (op.form) return `section.${op.form}`
  if (op.table) return `section.${op.table}`
  if (op.navbar) return `section.${op.navbar}`
  if (op.op?.startsWith('navigation.')) return 'navigation'
  if (op.op?.startsWith('project.')) return 'project'
  return null
}

function suggestionFor(message) {
  if (/unknown op/.test(message)) return 'Run intentstack list_capabilities --json and use one of the supported patch_ops.'
  if (/not found|cannot resolve/.test(message)) return 'Check the referenced id and owner file, or add the prerequisite object earlier in the same patch.'
  if (/already exists|duplicate/.test(message)) return 'Use an update/remove operation or make the add operation conditional before reapplying the patch.'
  if (/does not support/.test(message)) return 'Choose a primitive supported by the current target, or change the project target before applying this op.'
  if (/id mutations/.test(message)) return 'Use a dedicated rename operation once reference-safe renames are available.'
  return 'Inspect the operation fields and the reported owner file, then re-run intentstack apply before writing.'
}

function fixHintFor(message, op) {
  if (/not found|cannot resolve/.test(message)) return { kind: 'missing_reference', ref: semanticPathFor(op) }
  if (/already exists|duplicate/.test(message)) return { kind: 'duplicate_side_effect', op: op?.op || null }
  if (/does not support/.test(message)) return { kind: 'target_capability', op: op?.op || null }
  if (/unknown op/.test(message)) return { kind: 'unknown_operation', op: op?.op || null }
  if (/id mutations/.test(message)) return { kind: 'unsafe_id_mutation', op: op?.op || null }
  return { kind: 'patch_conflict', op: op?.op || null }
}

function pushPatchError(errors, conflicts, ast, op, idx, message, includeOp = true) {
  const issue = patchIssue(ast, op, idx, message, includeOp)
  errors.push(issue.text)
  conflicts.push(issue.conflict)
}

function patchIssue(ast, op, idx, message, includeOp = true) {
  const text = includeOp ? `patch[${idx}] (${op?.op}): ${message}` : `patch[${idx}]: ${message}`
  return { text, conflict: explainPatchError(ast, op, idx, message) }
}

function componentTypes(op) {
  if (op.op === 'section.add') return [op.section?.type]
  if (op.op === 'section.module.add') return [op.section?.type || op.type]
  if (op.op === 'section.update') return [op.type]
  if (op.op === 'page.create') return (op.sections || []).map((section) => section?.type)
  if (op.op === 'form.add') return ['form']
  if (op.op === 'table.add') return ['table']
  if (op.op === 'navbar.add') return ['navbar']
  return []
}
