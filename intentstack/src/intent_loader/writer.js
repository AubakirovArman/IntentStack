import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { defaultModulePath, samePath, stripMetadata } from './utils.js'

export async function writeIntentProject(ast, intentPath, opts = {}) {
  const writes = await planIntentProjectWrites(ast, intentPath, opts)
  await writeIntentFilesAtomic(writes)
  return writes.map((write) => write.file).sort()
}

export async function planIntentProjectWrites(ast, intentPath, opts = {}) {
  if (!ast?.__intentstack?.modular || opts.singleFile) {
    return [{ file: intentPath, doc: stripMetadata(ast) }]
  }

  const metadata = ast.__intentstack
  const rootPath = metadata.rootPath || intentPath
  const rootDoc = {}
  const writes = []
  const rootNext = { ...(rootDoc || {}) }
  rootNext.version = ast.version
  rootNext.includes = metadata.includes || rootNext.includes || []

  for (const key of ['project', 'theme', 'navigation', 'auth']) {
    const owner = metadata.owners?.[key]
    if (!owner || samePath(owner, rootPath)) {
      if (ast[key] != null) rootNext[key] = stripMetadata(ast[key])
    } else if (ast[key] != null) {
      stageIntentFile(writes, owner, { [key]: stripMetadata(ast[key]) })
    }
  }

  for (const key of ['entities', 'actions', 'workflows', 'integrations']) {
    writeCollectionModules(ast, metadata, key, rootPath, writes)
  }
  writePageModules(ast, metadata, rootPath, writes)
  writeSectionModules(ast, metadata, writes)

  stageIntentFile(writes, rootPath, rootNext)
  return dedupeWrites(writes)
}

export function writeCollectionModules(ast, metadata, collection, rootPath, writes) {
  const owners = metadata.owners?.[collection] || {}
  const groups = new Map()
  for (const item of ast[collection] || []) {
    if (!item?.id) continue
    const owner = owners[item.id]?.file || defaultModulePath(rootPath, collection, item.id)
    if (samePath(owner, rootPath)) continue
    if (!groups.has(owner)) groups.set(owner, [])
    groups.get(owner).push(item)
  }
  for (const [file, items] of sortedGroups(groups)) {
    const doc = items.length === 1
      ? { [singular(collection)]: stripMetadata(items[0]) }
      : { [collection]: items.map(stripMetadata) }
    stageIntentFile(writes, file, doc)
  }
}

export function writePageModules(ast, metadata, rootPath, writes) {
  const owners = metadata.owners?.pages || {}
  const groups = new Map()
  for (const page of ast.pages || []) {
    if (!page?.id) continue
    const owner = owners[page.id]?.file || defaultModulePath(rootPath, 'pages', page.id)
    if (samePath(owner, rootPath)) continue
    if (!groups.has(owner)) groups.set(owner, [])
    groups.get(owner).push(pageForWrite(page, metadata, owner))
  }
  for (const [file, pages] of sortedGroups(groups)) {
    const doc = pages.length === 1 ? { page: pages[0] } : { pages }
    stageIntentFile(writes, file, doc)
  }
}

export function writeSectionModules(ast, metadata, writes) {
  const groups = new Map()
  const owners = metadata.owners?.sections || {}
  for (const page of ast.pages || []) {
    for (const section of page.sections || []) {
      const owner = section?.id ? owners[section.id] : null
      if (!owner?.file) continue
      if (!groups.has(owner.file)) groups.set(owner.file, [])
      groups.get(owner.file).push({ section, owner })
    }
  }
  for (const [file, entries] of sortedGroups(groups)) {
    const doc = entries.length === 1
      ? sectionDoc(entries[0].section, entries[0].owner)
      : { sections: entries.map((entry) => stripMetadata(entry.section)) }
    stageIntentFile(writes, file, doc)
  }
}

function pageForWrite(page, metadata, pageOwner) {
  const next = stripMetadata(page)
  next.sections = (page.sections || []).map((section) => {
    const owner = section?.id ? metadata.owners?.sections?.[section.id] : null
    return owner?.file && !samePath(owner.file, pageOwner)
      ? { ref: section.id }
      : stripMetadata(section)
  })
  return next
}

function sectionDoc(section, owner) {
  const doc = { section: stripMetadata(section) }
  if (owner?.page) doc.page = owner.page
  return doc
}

function sortedGroups(groups) {
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
}

export async function writeIntentFile(file, doc) {
  await writeIntentFilesAtomic([{ file, doc }])
}

export async function writeIntentFilesAtomic(writes) {
  const rendered = await Promise.all(writes.map(async (write, index) => ({
    file: write.file,
    content: await renderIntentDoc(write.doc),
    temp: `${write.file}.tmp-${process.pid}-${Date.now()}-${index}`,
    backup: `${write.file}.bak-${process.pid}-${Date.now()}-${index}`,
    existed: existsSync(write.file),
  })))
  const backups = []
  const committed = []
  try {
    for (const entry of rendered) {
      mkdirSync(dirname(entry.file), { recursive: true })
      writeFileSync(entry.temp, entry.content)
    }
    for (const entry of rendered) {
      if (entry.existed) {
        copyFileSync(entry.file, entry.backup)
        backups.push(entry)
      }
      renameSync(entry.temp, entry.file)
      committed.push(entry)
    }
  } catch (e) {
    for (const entry of committed.reverse()) {
      if (entry.existed && existsSync(entry.backup)) renameSync(entry.backup, entry.file)
      else rmSync(entry.file, { force: true })
    }
    for (const entry of rendered) {
      rmSync(entry.temp, { force: true })
      rmSync(entry.backup, { force: true })
    }
    throw e
  }
  for (const entry of backups) rmSync(entry.backup, { force: true })
}

async function renderIntentDoc(doc) {
  const mod = await import('js-yaml')
  const YAML = mod.default ?? mod
  return YAML.dump(doc, { lineWidth: 100, noRefs: true })
}

function stageIntentFile(writes, file, doc) {
  writes.push({ file, doc })
}

function dedupeWrites(writes) {
  const seen = new Map()
  for (const write of writes) seen.set(write.file, write)
  return [...seen.values()].sort((a, b) => a.file.localeCompare(b.file))
}

function singular(collection) {
  return {
    entities: 'entity',
    actions: 'action',
    workflows: 'workflow',
    integrations: 'integration',
    pages: 'page',
    sections: 'section',
  }[collection] || collection.replace(/s$/, '')
}
