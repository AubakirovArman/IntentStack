export const PATCH_OP_METADATA = {
  'project.set_name': { category: 'project', required: ['name'], summary: 'Set the project display name.' },
  'project.set_target': { category: 'project', required: ['target'], summary: 'Set the project target adapter.' },
  'project.set_theme': { category: 'project', optional: ['theme', 'preset', 'radius', 'density', 'color', 'shadow'], summary: 'Merge theme settings.' },
  'page.create': { category: 'page', required: ['id', 'path'], optional: ['layout', 'sections'], summary: 'Create a page.' },
  'page.update': { category: 'page', required: ['id'], summary: 'Update page properties.' },
  'page.delete': { category: 'page', required: ['id'], summary: 'Delete a page.' },
  'page.set_layout': { category: 'page', required: ['id', 'layout'], optional: ['page'], summary: 'Set a page layout.' },
  'page.set_route': { category: 'page', required: ['id', 'path'], optional: ['page'], summary: 'Set a page route.' },
  'layout.set': { category: 'page', required: ['page'], optional: ['layout', 'value'], summary: 'Merge page layout config.' },
  'section.add': { category: 'section', required: ['page', 'section'], optional: ['before', 'after', 'index'], summary: 'Add an inline page section.' },
  'section.module.add': { category: 'section', required: ['page'], optional: ['section', 'id', 'type', 'title', 'items', 'blocks', 'before', 'after', 'index'], summary: 'Add a modular section and page ref.' },
  'section.update': { category: 'section', required: ['section'], optional: ['id'], summary: 'Update a section.' },
  'section.remove': { category: 'section', required: ['page', 'section'], summary: 'Remove a section from a page.' },
  'section.move': { category: 'section', required: ['page', 'section'], optional: ['before', 'after', 'index'], summary: 'Move a section within a page.' },
  'text.set': { category: 'content', required: ['target', 'value'], summary: 'Set text-like scalar content by semantic path.' },
  'navigation.set': { category: 'navigation', optional: ['navigation', 'enabled', 'logo', 'items'], summary: 'Set shared navigation.' },
  'navigation.logo.set': { category: 'navigation', optional: ['logo', 'value'], summary: 'Set shared navigation logo.' },
  'navigation.item.add': { category: 'navigation', required: ['item'], summary: 'Append a shared navigation item.' },
  'navigation.item.remove': { category: 'navigation', optional: ['label', 'href'], summary: 'Remove a shared navigation item.' },
  'navigation.item.update': { category: 'navigation', optional: ['label', 'href', 'item'], summary: 'Update a shared navigation item.' },
  'navbar.add': { category: 'navigation', required: ['page', 'id'], optional: ['logo', 'items'], summary: 'Add a page-local navbar.' },
  'navbar.item.add': { category: 'navigation', required: ['navbar', 'item'], summary: 'Append a page-local navbar item.' },
  'navbar.item.remove': { category: 'navigation', required: ['navbar'], optional: ['label', 'href'], summary: 'Remove a page-local navbar item.' },
  'navbar.item.update': { category: 'navigation', required: ['navbar'], optional: ['label', 'href', 'item'], summary: 'Update a page-local navbar item.' },
  'navbar.logo.set': { category: 'navigation', required: ['navbar'], optional: ['logo', 'value'], summary: 'Set a page-local navbar logo.' },
  'entity.create': { category: 'data', required: ['id'], optional: ['table', 'fields'], summary: 'Create an entity.' },
  'entity.delete': { category: 'data', required: ['id'], summary: 'Delete an entity.' },
  'entity.field.add': { category: 'data', required: ['entity', 'field'], summary: 'Add an entity field.' },
  'entity.field.update': { category: 'data', required: ['entity'], optional: ['field', 'id'], summary: 'Update an entity field.' },
  'entity.field.remove': { category: 'data', required: ['entity'], optional: ['field', 'id'], summary: 'Remove an entity field.' },
  'action.create': { category: 'action', required: ['id', 'type'], optional: ['entity'], summary: 'Create an action.' },
  'action.update': { category: 'action', required: ['id'], summary: 'Update an action.' },
  'action.delete': { category: 'action', required: ['id'], summary: 'Delete an action.' },
  'action.bind': { category: 'action', optional: ['action', 'id', 'entity', 'target'], summary: 'Bind an action to an entity or target.' },
  'form.add': { category: 'form', required: ['page', 'id'], optional: ['title', 'entity', 'fields', 'submit', 'action'], summary: 'Add a form section.' },
  'form.field.add': { category: 'form', required: ['form', 'field'], summary: 'Add a field to a form.' },
  'form.field.remove': { category: 'form', required: ['form'], optional: ['field', 'id'], summary: 'Remove a field from a form.' },
  'form.field.update': { category: 'form', required: ['form'], optional: ['field', 'id', 'value'], summary: 'Update a form field.' },
  'form.bind_entity': { category: 'form', required: ['form', 'entity'], summary: 'Bind a form to an entity.' },
  'form.bind_submit': { category: 'form', required: ['form', 'action'], summary: 'Bind a form submit action.' },
  'form.set_success_message': { category: 'form', required: ['form'], optional: ['message', 'value'], summary: 'Set a form success message.' },
  'table.add': { category: 'table', required: ['page', 'id'], optional: ['entity', 'columns', 'source', 'action'], summary: 'Add a table section.' },
  'table.column.add': { category: 'table', required: ['table', 'column'], summary: 'Add a table column.' },
  'table.column.remove': { category: 'table', required: ['table'], optional: ['column', 'id'], summary: 'Remove a table column.' },
  'table.column.update': { category: 'table', required: ['table'], optional: ['column', 'id', 'value'], summary: 'Update a table column.' },
  'table.bind_source': { category: 'table', required: ['table', 'action'], summary: 'Bind a table source action.' },
  'component.add': { category: 'component', required: ['section', 'component'], summary: 'Add a nested component.' },
  'component.update': { category: 'component', required: ['section'], optional: ['component', 'id', 'value'], summary: 'Update a nested component.' },
  'component.remove': { category: 'component', required: ['section'], optional: ['component', 'id'], summary: 'Remove a nested component.' },
  'content.block.add': { category: 'content', required: ['section', 'block'], optional: ['before', 'after', 'index'], summary: 'Add a content block.' },
  'content.example.add': { category: 'content', required: ['section', 'code'], optional: ['block', 'id', 'title', 'text', 'preview_section', 'example_section', 'target_section', 'language', 'before', 'after', 'index'], summary: 'Add an embedded live-preview example block.' },
  'content.blocks.set': { category: 'content', required: ['section', 'blocks'], summary: 'Replace all content blocks.' },
  'content.block.update': { category: 'content', required: ['section'], optional: ['block', 'id', 'index', 'value'], summary: 'Update a content block.' },
  'content.block.move': { category: 'content', required: ['section'], optional: ['block', 'id', 'index', 'before', 'after', 'to'], summary: 'Move a content block.' },
  'content.block.remove': { category: 'content', required: ['section'], optional: ['block', 'id', 'index'], summary: 'Remove a content block.' },
  'api.route.create': { category: 'api', required: ['id', 'method', 'path', 'action'], summary: 'Create an API route binding.' },
  'api.bind_action': { category: 'api', required: ['action'], optional: ['route', 'id'], summary: 'Bind an API route to an action.' },
}

export function patchOpCatalog(opNames = Object.keys(PATCH_OP_METADATA)) {
  return Object.fromEntries(opNames.sort().map((op) => [op, metadataFor(op)]))
}

export function patchOpSchema(opNames = Object.keys(PATCH_OP_METADATA)) {
  return {
    type: 'object',
    required: ['patch'],
    properties: {
      version: { enum: [0.1, '0.1'] },
      patch: { type: 'array', items: { oneOf: opNames.sort().map(opSchema) } },
      ops: { type: 'array', items: { oneOf: opNames.sort().map(opSchema) } },
    },
    additionalProperties: true,
  }
}

function metadataFor(op) {
  const meta = PATCH_OP_METADATA[op] || { category: 'unknown', summary: 'Undocumented patch operation.' }
  return {
    op,
    category: meta.category,
    summary: meta.summary,
    required: [...(meta.required || [])],
    optional: [...(meta.optional || [])],
    schema: opSchema(op),
  }
}

function opSchema(op) {
  const meta = PATCH_OP_METADATA[op] || {}
  const fields = [...new Set(['op', ...(meta.required || []), ...(meta.optional || [])])]
  return {
    type: 'object',
    required: ['op', ...(meta.required || [])],
    properties: Object.fromEntries(fields.map((field) => [field, fieldSchema(field, op)])),
    additionalProperties: true,
  }
}

function fieldSchema(field, op) {
  if (field === 'op') return { const: op }
  if (['enabled'].includes(field)) return { type: 'boolean' }
  if (['index', 'to'].includes(field)) return { type: 'number' }
  if (['fields', 'items', 'columns', 'sections', 'blocks'].includes(field)) return { type: 'array' }
  if (['section', 'field', 'item', 'component', 'block', 'theme', 'navigation', 'layout', 'value', 'source', 'submit'].includes(field)) {
    return { type: ['object', 'string', 'array', 'number', 'boolean'] }
  }
  return { type: 'string' }
}
