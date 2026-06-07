// Normalize author-friendly DSL into the Core IR shape used by validation and emit.
// The source intent is not mutated, so modular writeback can preserve compact YAML.

const clone = (value) => JSON.parse(JSON.stringify(value))

export function normalize(ast) {
  if (!ast || typeof ast !== 'object') return ast
  const next = clone(ast)
  if (ast.__intentstack) {
    Object.defineProperty(next, '__intentstack', {
      value: ast.__intentstack,
      enumerable: false,
      configurable: true,
      writable: true,
    })
  }
  const entityById = Object.fromEntries((next.entities || []).map((entity) => [entity.id, entity]))

  for (const entity of next.entities || []) {
    entity.fields = (entity.fields || []).map((field) => {
      if (typeof field === 'string') return { id: field, type: 'string' }
      if (field && typeof field === 'object' && !Array.isArray(field) && !field.id && field.name) return { ...field, id: field.name }
      return field
    })
  }

  for (const page of next.pages || []) {
    for (const section of page.sections || []) {
      normalizeSection(section, entityById)
    }
  }

  return next
}

function normalizeSection(section, entityById) {
  if (!section || typeof section !== 'object') return
  const entity = entityById[section.entity]
  if (!entity) return

  if (section.type === 'form') {
    section.fields = normalizeFieldRefs(section.fields, entity)
  }
  if (section.type === 'table') {
    section.columns = normalizeFieldRefs(section.columns, entity)
  }
  if (section.type === 'record_detail') {
    section.fields = normalizeFieldRefs(section.fields, entity)
  }
}

function normalizeFieldRefs(refs, entity) {
  const source = refs && refs.length ? refs : (entity.fields || []).map((field) => field.id)
  return source.map((ref) => normalizeFieldRef(ref, entity.id))
}

function normalizeFieldRef(ref, entityId) {
  if (typeof ref === 'string') return { id: ref, ref: fieldRef(entityId, ref) }
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return ref
  const id = ref.id || ref.name || ref.field
  if (!id) return ref
  return {
    ...ref,
    id,
    ref: ref.ref || fieldRef(entityId, id),
  }
}

function fieldRef(entityId, fieldId) {
  return `Entity.${entityId}.field.${fieldId}`
}
