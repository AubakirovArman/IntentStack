import { intentSuggestions } from './suggestions.js'

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

function list(items, render) {
  if (!items?.length) return '<p class="muted">None</p>'
  return `<ul>${items.map(render).join('')}</ul>`
}

export function renderGraphHtml(graph, history = [], opts = {}) {
  const editorApi = opts.editorApi === true
  const sectionTargets = graph.pages.flatMap((page) =>
    page.sections.map((section) => `page.${page.id}.section.${section.id}`))
  const pages = list(graph.pages, (page) => `<li>
    <strong>${esc(page.id)}</strong> <span class="pill">${esc(page.path)}</span>
    ${list(page.sections, (section) => `<li><span>${esc(section.id)}</span> <span class="muted">${esc(section.type)}</span></li>`)}
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
    ${list(moduleOwners, (owner) => `<li><strong>${esc(owner.id)}</strong> <span class="muted">${esc(owner.file)}</span></li>`)}`
    : '<p class="muted">Single-file intent.</p>'
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
    </style>
  </head>
  <body>
    <header>
      <h1>${esc(graph.project?.id)} <span class="pill">${esc(graph.project?.target)}</span></h1>
      <div class="muted">${esc(graph.project?.name || 'IntentStack app')}</div>
    </header>
    <main>
      <section><h2>Pages and Sections</h2>${pages}</section>
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
      const suggestions = ${JSON.stringify(suggestions.map((item) => item.yaml))}
      let patchDirty = false
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
      target?.addEventListener('change', updatePatch)
      prop?.addEventListener('input', updatePatch)
      value?.addEventListener('input', updatePatch)
      patchYaml?.addEventListener('input', () => { patchDirty = true })
      document.getElementById('patch-copy')?.addEventListener('click', () => navigator.clipboard?.writeText(patchYaml?.value || output.textContent))
      document.getElementById('patch-refresh')?.addEventListener('click', () => location.reload())
      document.getElementById('patch-apply')?.addEventListener('click', async () => {
        setStatus('Applying patch...', 'muted')
        const res = await fetch('/api/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patch: patchYaml?.value || output.textContent }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || json.ok === false) {
          setStatus((json.errors || [json.error || 'Patch failed']).join('; '), 'error')
          return
        }
        setStatus('Patch applied. Refreshing graph...', 'ok')
        setTimeout(() => location.reload(), 350)
      })
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
