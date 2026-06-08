import { closest } from '../diagnostics.js'
import {
  asArray,
  isPlainObject,
  CONTENT_BLOCK_TYPES,
  actionById,
  entityFieldIds,
  defaultDetailPath,
} from './utils.js'

export function validateContent(d, sp, s, page) {
  const blocks = asArray(d, s.blocks, `${sp}.blocks`)
  if (blocks.length === 0) {
    d.warn('W3100', `Content section "${s.id}" has no blocks.`, { path: `${sp}.blocks` })
    return
  }
  const ids = new Set()
  const pageSections = page?.sections || []
  const pageSectionIds = new Set(pageSections.map((section) => section?.id).filter(Boolean))
  for (const [i, block] of blocks.entries()) {
    const bp = `${sp}.blocks[${i}]`
    if (!isPlainObject(block)) {
      d.error('E2230', 'content block must be an object.', { path: bp })
      continue
    }
    if (block.id) {
      if (ids.has(block.id)) d.error('E2231', `Duplicate content block id "${block.id}".`, { path: `${bp}.id` })
      ids.add(block.id)
    }
    if (!block.type) {
      d.error('E2232', 'content block type is required.', { path: `${bp}.type` })
      continue
    }
    if (!CONTENT_BLOCK_TYPES.includes(block.type)) {
      d.error('E2233', `Unsupported content block type "${block.type}".`, {
        path: `${bp}.type`,
        suggestion: `Supported: ${CONTENT_BLOCK_TYPES.join(', ')}`,
      })
      continue
    }
    if (block.type === 'heading') {
      if (!block.text) d.error('E2234', 'heading block text is required.', { path: `${bp}.text` })
      if (block.level != null && (![2, 3, 4].includes(Number(block.level)))) {
        d.error('E2235', 'heading block level must be 2, 3, or 4.', { path: `${bp}.level` })
      }
    }
    if (block.type === 'paragraph' && !block.text) d.error('E2236', 'paragraph block text is required.', { path: `${bp}.text` })
    if (block.type === 'link') {
      if (!block.text) d.error('E2240', 'link block text is required.', { path: `${bp}.text` })
      if (!block.href) d.error('E2241', 'link block href is required.', { path: `${bp}.href` })
    }
    if (block.type === 'callout' && !block.text) d.error('E2242', 'callout block text is required.', { path: `${bp}.text` })
    if (block.type === 'list') {
      const items = asArray(d, block.items, `${bp}.items`)
      if (items.length === 0) d.error('E2237', 'list block items are required.', { path: `${bp}.items` })
      for (const [j, item] of items.entries()) {
        if (typeof item !== 'string') d.error('E2238', 'list block item must be a string.', { path: `${bp}.items[${j}]` })
      }
    }
    if (block.type === 'code' && !block.code) d.error('E2239', 'code block code is required.', { path: `${bp}.code` })
    if (block.type === 'table') {
      const columns = asArray(d, block.columns, `${bp}.columns`)
      const rows = asArray(d, block.rows, `${bp}.rows`)
      if (columns.length === 0) d.error('E2243', 'table block columns are required.', { path: `${bp}.columns` })
      if (rows.length === 0) d.error('E2244', 'table block rows are required.', { path: `${bp}.rows` })
    }
    if (block.type === 'example') {
      if (!block.section) d.error('E2245', 'example block section is required.', { path: `${bp}.section` })
      if (!block.code) d.error('E2246', 'example block code is required.', { path: `${bp}.code` })
      if (block.section === s.id) {
        d.error('E2247', 'example block cannot embed its own content section.', { path: `${bp}.section` })
      } else if (block.section && !pageSectionIds.has(block.section)) {
        d.error('E2248', `Example block references unknown section "${block.section}" on this page.`, {
          path: `${bp}.section`,
          suggestion: 'Add the referenced section to this page, usually with embed_only: true.',
        })
      } else if (block.section) {
        const ref = pageSections.find((section) => section?.id === block.section)
        if (ref && ref.embed_only !== true) {
          d.warn('W3101', `Example block embeds section "${block.section}" that will also render as a standalone page section.`, {
            path: `${bp}.section`,
            suggestion: 'Set embed_only: true on the referenced section.',
          })
        }
      }
    }
  }
}

export function validateForm(d, sp, s, ctx) {
  if (!s.entity) {
    d.error('E2200', `Form "${s.id}" has no entity.`, { path: `${sp}.entity` })
  } else if (!ctx.entityIds.has(s.entity)) {
    const did = closest(s.entity, [...ctx.entityIds])
    d.error('E2201', `Form "${s.id}" references unknown entity "${s.entity}".`, {
      path: `${sp}.entity`,
      suggestion: did ? `Did you mean "${did}"?` : undefined,
      fix_hint: did ? { op: 'form.bind_entity', form: s.id, entity: did } : undefined,
    })
  }
  const submitAction = s.submit?.action
  if (submitAction && !ctx.actionIds.has(submitAction)) {
    const did = closest(submitAction, [...ctx.actionIds])
    d.error('E3002', `Form "${s.id}" submit references unknown action "${submitAction}".`, {
      path: `${sp}.submit.action`, suggestion: did ? `Did you mean "${did}"?` : undefined,
    })
  }
  if (!s.submit?.success_message) d.warn('W3001', `Form "${s.id}" has no success_message.`, { path: `${sp}.submit.success_message` })
  if (s.entity && ctx.entityIds.has(s.entity)) {
    const ids = entityFieldIds(ctx.entities, s.entity)
    for (const f of s.fields || []) {
      const fid = typeof f === 'string' ? f : (f.name || f.id)
      if (!ids.has(fid)) {
        d.error('E3003', `Form "${s.id}" field "${fid}" is not a field of entity "${s.entity}".`, {
          path: `${sp}.fields`, suggestion: `Available: ${[...ids].join(', ')}`,
        })
      }
    }
  }
}

export function validateRecordDetail(d, sp, s, ctx) {
  if (!s.entity) {
    d.error('E2220', `Record detail "${s.id}" has no entity.`, { path: `${sp}.entity` })
  } else if (!ctx.entityIds.has(s.entity)) {
    const did = closest(s.entity, [...ctx.entityIds])
    d.error('E2221', `Record detail "${s.id}" references unknown entity "${s.entity}".`, {
      path: `${sp}.entity`, suggestion: did ? `Did you mean "${did}"?` : undefined,
    })
  }
  const src = s.source?.action
  if (!src) {
    d.error('E2222', `Record detail "${s.id}" must declare source.action.`, { path: `${sp}.source.action` })
  } else if (!ctx.actionIds.has(src)) {
    const did = closest(src, [...ctx.actionIds])
    d.error('E3005', `Record detail "${s.id}" source references unknown action "${src}".`, {
      path: `${sp}.source.action`, suggestion: did ? `Did you mean "${did}"?` : undefined,
    })
  } else {
    const a = actionById(ctx.actions, src)
    if (a?.type !== 'get_record') {
      d.error('E2223', `Record detail "${s.id}" source.action must be a get_record action.`, { path: `${sp}.source.action` })
    }
  }
  const update = s.update?.action
  if (update) {
    if (!ctx.actionIds.has(update)) {
      const did = closest(update, [...ctx.actionIds])
      d.error('E3002', `Record detail "${s.id}" update references unknown action "${update}".`, {
        path: `${sp}.update.action`, suggestion: did ? `Did you mean "${did}"?` : undefined,
      })
    } else {
      const a = actionById(ctx.actions, update)
      if (a?.type !== 'update_record') {
        d.error('E2224', `Record detail "${s.id}" update.action must be an update_record action.`, { path: `${sp}.update.action` })
      }
    }
  }
  if (s.entity && ctx.entityIds.has(s.entity)) {
    const ids = entityFieldIds(ctx.entities, s.entity)
    for (const f of s.fields || []) {
      const fid = typeof f === 'string' ? f : (f.name || f.id)
      if (!ids.has(fid)) {
        d.error('E3003', `Record detail "${s.id}" field "${fid}" is not a field of entity "${s.entity}".`, {
          path: `${sp}.fields`, suggestion: `Available: ${[...ids].join(', ')}`,
        })
      }
    }
  }
}

export function validateTable(d, sp, s, ctx, opts = {}) {
  if (!s.entity) {
    d.error('E2210', `Table "${s.id}" has no entity.`, { path: `${sp}.entity` })
  } else if (!ctx.entityIds.has(s.entity)) {
    const did = closest(s.entity, [...ctx.entityIds])
    d.error('E2211', `Table "${s.id}" references unknown entity "${s.entity}".`, {
      path: `${sp}.entity`, suggestion: did ? `Did you mean "${did}"?` : undefined,
    })
  }
  const src = s.source?.action
  if (src && !ctx.actionIds.has(src)) {
    const did = closest(src, [...ctx.actionIds])
    d.error('E3005', `Table "${s.id}" source references unknown action "${src}".`, {
      path: `${sp}.source.action`, suggestion: did ? `Did you mean "${did}"?` : undefined,
    })
  }
  if (s.entity && ctx.entityIds.has(s.entity)) {
    const ids = entityFieldIds(ctx.entities, s.entity)
    for (const col of s.columns || []) {
      const cid = typeof col === 'string' ? col : col.id
      if (!ids.has(cid)) {
        d.error('E3004', `Table "${s.id}" column "${cid}" is not a field of entity "${s.entity}".`, {
          path: `${sp}.columns`, suggestion: `Available: ${[...ids].join(', ')}`,
        })
      }
    }
    for (const [i, action] of (s.row_actions || []).entries()) {
      const type = action.type || action
      const requiredAction = type === 'edit' ? 'update_record' : type === 'delete' ? 'delete_record' : null
      if (!requiredAction) {
        if (type === 'detail') {
          const target = action.target || defaultDetailPath(opts.page?.path)
          opts.refs?.push({ table: s.id, entity: s.entity, path: target, pathRef: `${sp}.row_actions[${i}]` })
          continue
        }
        d.error('E2212', `Unsupported table row action "${type}".`, { path: `${sp}.row_actions[${i}]`, suggestion: 'Supported: detail, edit, delete' })
        continue
      }
      const exists = (ctx.actions || []).some((a) => a.entity === s.entity && a.type === requiredAction)
      if (!exists) {
        d.error('E3009', `Table "${s.id}" row action "${type}" requires a ${requiredAction} action for entity "${s.entity}".`, {
          path: `${sp}.row_actions[${i}]`,
          suggestion: `Add action.create with type ${requiredAction} and entity ${s.entity}.`,
        })
      }
    }
  }
}
