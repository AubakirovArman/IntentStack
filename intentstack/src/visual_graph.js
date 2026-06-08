import { intentSuggestions } from './suggestions.js'
export { renderPreviewHtml } from './visual_graph/preview.js'

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

function list(items, render) {
  if (!items?.length) return '<p class="muted">None</p>'
  return `<ul>${items.map(render).join('')}</ul>`
}

function sectionList(page, editorApi) {
  if (!page.sections?.length) return '<p class="muted">None</p>'
  const rows = page.sections.map((section) => `<li class="section-row" ${editorApi ? 'draggable="true" data-section-move="true"' : ''} data-page="${esc(page.id)}" data-section-id="${esc(section.id)}">
    ${editorApi ? '<span class="drag-handle" aria-hidden="true">::</span>' : ''}
    <span><strong>${esc(section.id)}</strong> <span class="muted">${esc(section.type)}</span></span>
    <span class="pill">${esc(section.entity || 'ui')}</span>
  </li>`).join('')
  const end = editorApi ? `<li class="drop-end" data-section-drop-end="true" data-page="${esc(page.id)}" data-index="${page.sections.length}">Drop here to move to end</li>` : ''
  return `<ol class="section-list" data-page-sections="${esc(page.id)}">${rows}${end}</ol>`
}

export function renderGraphHtml(graph, history = [], opts = {}) {
  const editorApi = opts.editorApi === true
  const firstPageId = graph.pages?.[0]?.id || ''
  const pageOptions = (graph.pages || []).map((page) => `<option value="${esc(page.id)}">${esc(page.id)} ${esc(page.path || '')}</option>`).join('')
  const sectionTargets = graph.pages.flatMap((page) =>
    page.sections.map((section) => `page.${page.id}.section.${section.id}`))
  const pages = list(graph.pages, (page) => `<li>
    <strong>${esc(page.id)}</strong> <span class="pill">${esc(page.path)}</span>
    ${sectionList(page, editorApi)}
  </li>`)
  const entities = list(graph.entities, (entity) => `<li>
    <strong>${esc(entity.id)}</strong> <span class="muted">${esc(entity.table)}</span>
    ${list(entity.fields, (field) => `<li>${esc(field)}</li>`)}
  </li>`)
  const actions = list(graph.actions, (action) => `<li><strong>${esc(action.id)}</strong> <span class="muted">${esc(action.type)} ${esc(action.entity)}</span></li>`)
  const workflows = list(graph.workflows, (workflow) => `<li><strong>${esc(workflow.id)}</strong> <span class="muted">trigger: ${esc(workflow.trigger?.action)}</span></li>`)
  const integrations = list(graph.integrations, (integration) => `<li><strong>${esc(integration.id)}</strong> <span class="muted">${esc(integration.type)}</span></li>`)
  const suggestions = intentSuggestions(graph)
  const suggestionCards = suggestions.length ? suggestions.map((item, index) => `<article class="suggestion">
    <strong>${esc(item.title)}</strong>
    <p class="muted">${esc(item.reason)}</p>
    ${editorApi ? `<button type="button" data-suggestion-load="${index}">Load in editor</button>` : ''}
    <button type="button" data-suggestion="${index}">Copy suggestion</button>
    <pre><code>${esc(item.yaml)}</code></pre>
  </article>`).join('') : '<p class="muted">No suggestions.</p>'
  const moduleOwners = flattenOwners(graph.modules)
  const modules = graph.modules?.modular ? `<p><strong>Root</strong><br /><span class="muted">${esc(graph.modules.root_path)}</span></p>
    <p><strong>Includes</strong></p>
    ${list(graph.modules.includes || [], (include) => `<li>${esc(include)}</li>`)}
    <p><strong>Source Files</strong></p>
    ${list(graph.modules.source_files || [], (file) => `<li><span class="muted">${esc(file)}</span></li>`)}
    <p><strong>Owners</strong></p>
    ${list(moduleOwners, (owner) => `<li><strong>${esc(owner.id)}</strong> <span class="muted">${esc(owner.file)}</span></li>`)}` : '<p class="muted">Single-file intent.</p>'
  const patches = list(history.slice(-20).reverse(), (entry) => `<li>
    <strong>${esc(entry.timestamp)}</strong>
    <span class="muted">${esc(entry.patch)}</span>
    ${list(entry.changes || [], (change) => `<li>${esc(change.op)}: ${esc(change.summary)}</li>`)}
  </li>`)

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>IntentStack Graph - ${esc(graph.project?.id)}</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      body { margin: 0; background: #f8fafc; color: #0f172a; }
      header { padding: 32px; background: #ffffff; border-bottom: 1px solid #e2e8f0; }
      main { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; padding: 24px; }
      section { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; }
      h1 { margin: 0 0 6px; font-size: 28px; }
      h2 { margin: 0 0 12px; font-size: 17px; }
      ul { margin: 8px 0 0; padding-left: 20px; }
      li { margin: 6px 0; }
      .muted { color: #64748b; }
      .pill { display: inline-block; margin-left: 6px; padding: 2px 8px; border-radius: 999px; background: #e2e8f0; color: #334155; font-size: 12px; }
      input, textarea, select { width: 100%; box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; font: inherit; }
      button { border: 0; border-radius: 6px; padding: 8px 12px; background: #0f172a; color: #fff; cursor: pointer; }
      button.secondary { background: #e2e8f0; color: #0f172a; }
      button.danger { background: #b91c1c; color: #fff; }
      pre { overflow-x: auto; background: #0f172a; color: #e2e8f0; border-radius: 8px; padding: 12px; }
      .form { display: grid; gap: 10px; }
      .actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .suggestion { display: grid; gap: 8px; border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 12px; }
      .status { min-height: 22px; font-size: 13px; }
      .status.ok { color: #047857; }
      .status.error { color: #b91c1c; }
      .section-list { padding-left: 0; list-style: none; }
      .section-row { display: grid; grid-template-columns: ${editorApi ? '24px ' : ''}1fr auto; align-items: center; gap: 8px; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; background: #f8fafc; }
      .section-row[draggable="true"] { cursor: grab; }
      .section-row.dragging { opacity: 0.45; }
      .drag-handle { color: #64748b; font-weight: 700; text-align: center; }
      .drop-end { border: 1px dashed #94a3b8; border-radius: 6px; padding: 8px; color: #64748b; text-align: center; }
      .preview-panel { grid-column: 1 / -1; }
      .preview-toolbar { display: grid; grid-template-columns: minmax(180px, 320px) auto 1fr; gap: 8px; align-items: end; margin-bottom: 12px; }
      .preview-frame { width: 100%; height: min(72vh, 760px); border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; }
      @media (max-width: 720px) { .preview-toolbar { grid-template-columns: 1fr; } .preview-frame { height: 620px; } }
    </style>
  </head>
  <body>
    <header>
      <h1>${esc(graph.project?.id)} <span class="pill">${esc(graph.project?.target)}</span></h1>
      <div class="muted">${esc(graph.project?.name || 'IntentStack app')}</div>
    </header>
    <main>
      ${editorApi ? `<section class="preview-panel">
        <h2>Live Preview</h2>
        ${firstPageId ? `<div class="preview-toolbar">
          <label>Page<select id="preview-page">${pageOptions}</select></label>
          <button type="button" id="preview-refresh" class="secondary">Refresh preview</button>
          <span class="muted">Rendered from current intent without writing generated app files.</span>
        </div>
        <iframe id="page-preview" class="preview-frame" title="IntentStack page preview" src="/api/preview?page=${esc(encodeURIComponent(firstPageId))}"></iframe>` : '<p class="muted">No pages to preview.</p>'}
      </section>` : ''}
      <section><h2>Pages and Sections</h2>${editorApi ? '<p class="muted">Drag sections within a page to create and apply a semantic section.move patch.</p>' : ''}${pages}</section>
      <section>
        <h2>Patch Builder</h2>
        <div class="form">
          <label>Target section<select id="patch-target">${sectionTargets.map((target) => `<option value="${esc(target)}">${esc(target)}</option>`).join('')}</select></label>
          <label>Property<input id="patch-prop" value="title" /></label>
          <label>Value<textarea id="patch-value" rows="3"></textarea></label>
          <div class="actions">
            <button type="button" id="patch-copy">Copy patch</button>
            ${editorApi ? '<button type="button" id="patch-apply" class="danger">Apply patch</button><button type="button" id="patch-refresh" class="secondary">Refresh</button>' : ''}
          </div>
          <pre><code id="patch-output"></code></pre>
          ${editorApi ? '<label>Patch YAML<textarea id="patch-yaml" rows="10"></textarea></label><div id="patch-status" class="status muted">Connected to local editor server.</div>' : ''}
        </div>
      </section>
      <section><h2>Suggestions</h2>${suggestionCards}</section>
      <section><h2>Entities</h2>${entities}</section>
      <section><h2>Actions</h2>${actions}</section>
      <section><h2>Modules</h2>${modules}</section>
      <section><h2>Workflows</h2>${workflows}</section>
      <section><h2>Integrations</h2>${integrations}</section>
      <section><h2>Patch History</h2>${patches}</section>
    </main>
    <script>
      const target = document.getElementById('patch-target')
      const prop = document.getElementById('patch-prop')
      const value = document.getElementById('patch-value')
      const output = document.getElementById('patch-output')
      const patchYaml = document.getElementById('patch-yaml')
      const status = document.getElementById('patch-status')
      const previewPage = document.getElementById('preview-page')
      const previewFrame = document.getElementById('page-preview')
      const suggestions = ${JSON.stringify(suggestions.map((item) => item.yaml))}
      const editorApi = ${editorApi ? 'true' : 'false'}
      let patchDirty = false
      let draggedSection = null
      function refreshPreview() {
        if (!previewPage || !previewFrame) return
        const page = encodeURIComponent(previewPage.value || '')
        previewFrame.src = '/api/preview?page=' + page + '&t=' + Date.now()
      }
      function updatePatch() {
        const path = target.value + '.' + (prop.value || 'title')
        const yaml = 'version: 0.1\\npatch:\\n  - op: text.set\\n    target: ' + path + '\\n    value: ' + JSON.stringify(value.value)
        output.textContent = yaml
        if (patchYaml && !patchDirty) patchYaml.value = yaml
      }
      function setStatus(message, kind) {
        if (!status) return
        status.textContent = message
        status.className = 'status ' + (kind || 'muted')
      }
      async function applyPatchText(text, message) {
        if (!editorApi) return false
        setStatus(message || 'Applying patch...', 'muted')
        const res = await fetch('/api/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patch: text }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || json.ok === false) {
          setStatus((json.errors || [json.error || 'Patch failed']).join('; '), 'error')
          return false
        }
        refreshPreview()
        setStatus('Patch applied. Refreshing graph...', 'ok')
        setTimeout(() => location.reload(), 350)
        return true
      }
      function movePatch(page, section, opts) {
        let yaml = 'version: 0.1\\npatch:\\n  - op: section.move\\n    page: ' + page + '\\n    section: ' + section
        if (opts.before) yaml += '\\n    before: ' + opts.before
        if (opts.after) yaml += '\\n    after: ' + opts.after
        if (opts.index != null) yaml += '\\n    index: ' + opts.index
        return yaml
      }
      function loadPatch(yaml) {
        output.textContent = yaml
        if (patchYaml) {
          patchYaml.value = yaml
          patchDirty = true
        }
      }
      target?.addEventListener('change', updatePatch)
      prop?.addEventListener('input', updatePatch)
      value?.addEventListener('input', updatePatch)
      patchYaml?.addEventListener('input', () => { patchDirty = true })
      previewPage?.addEventListener('change', refreshPreview)
      document.getElementById('preview-refresh')?.addEventListener('click', refreshPreview)
      document.getElementById('patch-copy')?.addEventListener('click', () => navigator.clipboard?.writeText(patchYaml?.value || output.textContent))
      document.getElementById('patch-refresh')?.addEventListener('click', () => location.reload())
      document.getElementById('patch-apply')?.addEventListener('click', () => applyPatchText(patchYaml?.value || output.textContent))
      for (const row of document.querySelectorAll('[data-section-move]')) {
        row.addEventListener('dragstart', (event) => {
          draggedSection = { page: row.dataset.page, section: row.dataset.sectionId }
          row.classList.add('dragging')
          event.dataTransfer?.setData('text/plain', JSON.stringify(draggedSection))
        })
        row.addEventListener('dragend', () => row.classList.remove('dragging'))
        row.addEventListener('dragover', (event) => event.preventDefault())
        row.addEventListener('drop', async (event) => {
          event.preventDefault()
          if (!draggedSection || draggedSection.section === row.dataset.sectionId) return
          if (draggedSection.page !== row.dataset.page) {
            setStatus('Move sections within the same page for now.', 'error')
            return
          }
          const yaml = movePatch(row.dataset.page, draggedSection.section, { before: row.dataset.sectionId })
          loadPatch(yaml)
          await applyPatchText(yaml, 'Moving section...')
        })
      }
      for (const zone of document.querySelectorAll('[data-section-drop-end]')) {
        zone.addEventListener('dragover', (event) => event.preventDefault())
        zone.addEventListener('drop', async (event) => {
          event.preventDefault()
          if (!draggedSection || draggedSection.page !== zone.dataset.page) return
          const yaml = movePatch(zone.dataset.page, draggedSection.section, { index: Number(zone.dataset.index || 0) })
          loadPatch(yaml)
          await applyPatchText(yaml, 'Moving section...')
        })
      }
      for (const button of document.querySelectorAll('[data-suggestion]')) {
        button.addEventListener('click', () => navigator.clipboard?.writeText(suggestions[Number(button.dataset.suggestion)] || ''))
      }
      for (const button of document.querySelectorAll('[data-suggestion-load]')) {
        button.addEventListener('click', () => {
          if (!patchYaml) return
          patchYaml.value = suggestions[Number(button.dataset.suggestionLoad)] || ''
          patchDirty = true
          patchYaml.focus()
          setStatus('Suggestion loaded. Review and apply.', 'muted')
        })
      }
      updatePatch()
    </script>
  </body>
</html>
`
}

function flattenOwners(modules) {
  if (!modules?.owners) return []
  const out = []
  for (const [key, value] of Object.entries(modules.owners)) {
    if (!value) continue
    if (typeof value === 'string') {
      out.push({ id: key, file: value })
      continue
    }
    for (const [id, owner] of Object.entries(value)) {
      if (owner?.file) out.push({ id: `${key}.${id}`, file: owner.file })
    }
  }
  return out
}

