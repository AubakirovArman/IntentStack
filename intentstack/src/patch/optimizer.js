import { clone } from './utils.js'

export function semanticPatchDiff(before, after) {
  const patch = []
  diffProject(before, after, patch)
  diffNavigation(before, after, patch)
  diffCollections(before.entities || [], after.entities || [], patch, diffEntity)
  diffCollections(before.actions || [], after.actions || [], patch, diffAction)
  diffPages(before.pages || [], after.pages || [], patch)
  return { version: '0.1', patch }
}

function diffProject(before, after, patch) {
  if (before.project?.name !== after.project?.name && after.project?.name !== undefined) {
    patch.push({ op: 'project.set_name', name: after.project.name })
  }
  if (before.project?.target !== after.project?.target && after.project?.target !== undefined) {
    patch.push({ op: 'project.set_target', target: after.project.target })
  }
  if (!same(before.theme, after.theme) && after.theme !== undefined) {
    patch.push({ op: 'project.set_theme', theme: clone(after.theme) })
  }
}

function diffNavigation(before, after, patch) {
  if (!same(before.navigation, after.navigation) && after.navigation !== undefined) {
    patch.push({ op: 'navigation.set', navigation: clone(after.navigation) })
  }
}

function diffPages(beforePages, afterPages, patch) {
  const before = byId(beforePages)
  const after = byId(afterPages)
  for (const page of afterPages) {
    const prev = before.get(page.id)
    if (!prev) {
      patch.push({ op: 'page.create', id: page.id, path: page.path, layout: page.layout, sections: clone(page.sections || []) })
      continue
    }
    const changed = changedProps(prev, page, ['id', 'sections'])
    if (Object.keys(changed).length) patch.push({ op: 'page.update', id: page.id, ...changed })
    diffPageSections(prev, page, patch)
  }
  for (const page of beforePages) {
    if (!after.has(page.id)) patch.push({ op: 'page.delete', id: page.id })
  }
}

function diffPageSections(beforePage, afterPage, patch) {
  const before = byId(beforePage.sections || [])
  const after = byId(afterPage.sections || [])
  for (const section of afterPage.sections || []) {
    const prev = before.get(section.id)
    if (!prev) {
      patch.push({ op: 'section.add', page: afterPage.id, section: clone(section) })
      continue
    }
    const changed = changedProps(prev, section, ['id'])
    if (Object.keys(changed).length) patch.push({ op: 'section.update', section: section.id, ...changed })
  }
  for (const section of beforePage.sections || []) {
    if (!after.has(section.id)) patch.push({ op: 'section.remove', page: afterPage.id, section: section.id })
  }
  const beforeOrder = (beforePage.sections || []).map((section) => section.id).join('\0')
  const afterOrder = (afterPage.sections || []).map((section) => section.id).join('\0')
  if (beforeOrder !== afterOrder && same([...before.keys()].sort(), [...after.keys()].sort())) {
    patch.push({ op: 'page.update', id: afterPage.id, sections: clone(afterPage.sections || []) })
  }
}

function diffEntity(prev, next, patch) {
  const changed = changedProps(prev, next, ['id', 'fields'])
  if (Object.keys(changed).length) patch.push({ op: 'entity.delete', id: prev.id }, { op: 'entity.create', ...clone(next) })
  const before = byId(prev.fields || [])
  const after = byId(next.fields || [])
  for (const field of next.fields || []) {
    const old = before.get(field.id)
    if (!old) patch.push({ op: 'entity.field.add', entity: next.id, field: clone(field) })
    else if (!same(old, field)) {
      patch.push({ op: 'entity.field.update', entity: next.id, field: field.id, ...changedProps(old, field, ['id']) })
    }
  }
  for (const field of prev.fields || []) {
    if (!after.has(field.id)) patch.push({ op: 'entity.field.remove', entity: next.id, field: field.id })
  }
}

function diffAction(prev, next, patch) {
  if (!same(prev, next)) patch.push({ op: 'action.update', id: next.id, ...changedProps(prev, next, ['id']) })
}

function diffCollections(beforeItems, afterItems, patch, diffExisting) {
  const before = byId(beforeItems)
  const after = byId(afterItems)
  const collection = beforeItems[0]?.type || afterItems[0]?.type ? 'action' : 'entity'
  for (const item of afterItems) {
    const prev = before.get(item.id)
    if (!prev) patch.push({ op: `${collection}.create`, ...clone(item) })
    else diffExisting(prev, item, patch)
  }
  for (const item of beforeItems) {
    if (!after.has(item.id)) patch.push({ op: `${collection}.delete`, id: item.id })
  }
}

function changedProps(before, after, excluded = []) {
  const out = {}
  for (const [key, value] of Object.entries(after || {})) {
    if (!excluded.includes(key) && !same(before?.[key], value)) out[key] = clone(value)
  }
  return out
}

function byId(items) {
  return new Map((items || []).filter((item) => item?.id).map((item) => [item.id, item]))
}

function same(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}
