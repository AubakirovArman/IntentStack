export function renderPreviewHtml(graph, opts = {}) {
  const requestedPage = opts.page || graph.pages?.[0]?.id
  const page = (graph.pages || []).find((item) => item.id === requestedPage) || graph.pages?.[0]
  if (!page) return previewShell(graph, '<main class="empty">No page selected.</main>')
  const globalNav = graph.navigation && page.navigation !== false ? renderPreviewNavbar(graph.navigation, 'global-nav') : ''
  const sections = (page.sections || [])
    .filter((section) => section.embed_only !== true)
    .map((section) => renderPreviewSection(section, graph, new Set()))
    .join('')
  return previewShell(graph, `${globalNav}<main>${sections || '<section class="empty">No sections on this page.</section>'}</main>`, page)
}

function previewShell(graph, body, page = null) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>IntentStack page preview - ${esc(graph.project?.name || graph.project?.id || 'app')}</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #111827; background: #ffffff; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #ffffff; }
      main { min-height: 100vh; }
      section { padding: 56px 28px; border-bottom: 1px solid #e5e7eb; }
      h1, h2, h3, p { margin-top: 0; }
      h1 { font-size: clamp(36px, 6vw, 72px); line-height: 0.98; letter-spacing: 0; margin-bottom: 18px; }
      h2 { font-size: 28px; margin-bottom: 20px; }
      h3 { font-size: 18px; margin-bottom: 8px; }
      p { line-height: 1.65; color: #4b5563; }
      a { color: inherit; }
      code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      pre { overflow: auto; padding: 14px; border-radius: 8px; background: #111827; color: #f9fafb; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      th, td { border: 1px solid #e5e7eb; padding: 10px; text-align: left; }
      th { background: #f9fafb; }
      input, textarea, select { width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; font: inherit; }
      button, .button { display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 6px; padding: 10px 14px; background: #111827; color: #ffffff; text-decoration: none; font: inherit; }
      .preview-meta { position: sticky; top: 0; z-index: 10; display: flex; gap: 8px; align-items: center; padding: 10px 14px; background: rgba(255,255,255,0.92); border-bottom: 1px solid #e5e7eb; backdrop-filter: blur(8px); font-size: 13px; color: #4b5563; }
      .pill { display: inline-flex; border-radius: 999px; background: #eef2ff; color: #3730a3; padding: 2px 8px; font-size: 12px; }
      .nav { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 28px; border-bottom: 1px solid #e5e7eb; background: #ffffff; }
      .nav strong { font-size: 16px; }
      .nav-items { display: flex; gap: 14px; flex-wrap: wrap; color: #4b5563; font-size: 14px; }
      .hero { display: grid; place-items: center; min-height: 420px; text-align: center; background: #f9fafb; }
      .hero-inner { max-width: 780px; }
      .hero-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 20px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 16px; max-width: 1120px; margin: 0 auto; }
      .section-inner { max-width: 1120px; margin: 0 auto; }
      .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 18px; background: #ffffff; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04); }
      .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1px; overflow: hidden; border: 1px solid #e5e7eb; border-radius: 8px; background: #e5e7eb; }
      .stat { padding: 22px; background: #ffffff; }
      .stat-value { font-size: 30px; font-weight: 750; color: #111827; }
      .form-grid { display: grid; gap: 14px; max-width: 680px; }
      .field { display: grid; gap: 6px; }
      .detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
      .content { max-width: 860px; margin: 0 auto; }
      .content > * + * { margin-top: 16px; }
      .callout { border-left: 4px solid #2563eb; background: #eff6ff; padding: 14px; border-radius: 6px; }
      .example { display: grid; gap: 14px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; background: #f9fafb; }
      .footer { padding: 28px; color: #6b7280; background: #111827; border: 0; }
      .custom { border-style: dashed; color: #4b5563; }
      .empty { color: #6b7280; text-align: center; }
      @media (max-width: 720px) { section { padding: 40px 18px; } .nav { align-items: flex-start; flex-direction: column; } }
    </style>
  </head>
  <body>
    <div class="preview-meta">
      <strong>${esc(graph.project?.name || graph.project?.id || 'IntentStack app')}</strong>
      ${page ? `<span class="pill">${esc(page.id)}</span><span>${esc(page.path || '')}</span>` : ''}
    </div>
    ${body}
  </body>
</html>`
}

function renderPreviewSection(section, graph, seen) {
  if (!section) return ''
  if (section.embed_only === true && seen.size === 0) return ''
  switch (section.type) {
    case 'navbar':
      return renderPreviewNavbar(section, section.id)
    case 'hero':
      return renderPreviewHero(section)
    case 'card_grid':
      return renderPreviewCardGrid(section)
    case 'stats':
      return renderPreviewStats(section)
    case 'pricing_cards':
      return renderPreviewPricing(section)
    case 'content':
      return renderPreviewContent(section, graph, seen)
    case 'form':
      return renderPreviewForm(section, graph)
    case 'table':
      return renderPreviewTable(section, graph)
    case 'record_detail':
      return renderPreviewRecordDetail(section, graph)
    case 'footer':
      return `<section id="${esc(section.id)}" class="footer">${esc(section.text || section.title || graph.project?.name || graph.project?.id || '')}</section>`
    case 'custom_component':
      return `<section id="${esc(section.id)}"><div class="section-inner card custom"><strong>${esc(section.component || 'Custom component')}</strong><p>${esc(section.source || 'Custom code preview placeholder.')}</p></div></section>`
    default:
      return `<section id="${esc(section.id)}"><div class="section-inner card"><strong>${esc(section.id)}</strong><p>${esc(section.type)} section</p></div></section>`
  }
}

function renderPreviewNavbar(nav, id) {
  const items = (nav.items || []).map((item) => `<a href="${esc(item.href || item.target || '#')}">${esc(item.label || item.href || 'Link')}</a>`).join('')
  return `<nav id="${esc(id)}" class="nav"><strong>${esc(nav.logo || nav.title || 'App')}</strong><div class="nav-items">${items}</div></nav>`
}

function renderPreviewHero(section) {
  const actions = (section.actions || []).map((action) => `<a class="button" href="${esc(action.href || action.target || '#')}">${esc(action.label || 'Open')}</a>`).join('')
  return `<section id="${esc(section.id)}" class="hero"><div class="hero-inner">
    <h1>${esc(section.title || section.id)}</h1>
    ${section.subtitle ? `<p>${esc(section.subtitle)}</p>` : ''}
    ${actions ? `<div class="hero-actions">${actions}</div>` : ''}
  </div></section>`
}

function renderPreviewCardGrid(section) {
  const items = (section.items || []).map((item) => `<article class="card"><h3>${esc(item.title || item.name || 'Card')}</h3>${item.text ? `<p>${esc(item.text)}</p>` : ''}</article>`).join('')
  return `<section id="${esc(section.id)}"><div class="section-inner">
    ${section.title ? `<h2>${esc(section.title)}</h2>` : ''}
    <div class="grid">${items || '<p class="empty">No cards.</p>'}</div>
  </div></section>`
}

function renderPreviewStats(section) {
  const items = (section.items || section.stats || []).map((item) => `<article class="stat">
    <div>${esc(item.label || item.title || 'Metric')}</div>
    <div class="stat-value">${esc(item.value || '0')}</div>
    ${item.text ? `<p>${esc(item.text)}</p>` : ''}
  </article>`).join('')
  return `<section id="${esc(section.id)}"><div class="section-inner">
    ${section.title ? `<h2>${esc(section.title)}</h2>` : ''}
    <div class="stats">${items || '<article class="stat">No stats.</article>'}</div>
  </div></section>`
}

function renderPreviewPricing(section) {
  const plans = (section.plans || section.items || []).map((item) => `<article class="card">
    <h3>${esc(item.title || item.name || 'Plan')}</h3>
    <p class="stat-value">${esc(item.price || item.value || '')}</p>
    ${item.text ? `<p>${esc(item.text)}</p>` : ''}
    ${item.features?.length ? `<ul>${item.features.map((feature) => `<li>${esc(feature)}</li>`).join('')}</ul>` : ''}
  </article>`).join('')
  return `<section id="${esc(section.id)}"><div class="section-inner">
    ${section.title ? `<h2>${esc(section.title)}</h2>` : ''}
    <div class="grid">${plans || '<p class="empty">No plans.</p>'}</div>
  </div></section>`
}

function renderPreviewContent(section, graph, seen) {
  const blocks = (section.blocks || []).map((block) => renderPreviewContentBlock(block, graph, seen)).join('')
  return `<section id="${esc(section.id)}"><article class="content">
    ${section.title ? `<h1>${esc(section.title)}</h1>` : ''}
    ${blocks || '<p class="empty">No content blocks.</p>'}
  </article></section>`
}

function renderPreviewContentBlock(block, graph, seen) {
  if (block.type === 'heading') {
    const level = Math.min(Math.max(Number(block.level) || 2, 2), 4)
    return `<h${level}>${esc(block.text || block.title || '')}</h${level}>`
  }
  if (block.type === 'paragraph') return `<p>${esc(block.text || '')}</p>`
  if (block.type === 'list') return `<ul>${(block.items || []).map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`
  if (block.type === 'code') return `<pre><code>${esc(block.code || '')}</code></pre>`
  if (block.type === 'link') return `<p><a href="${esc(block.href || '#')}">${esc(block.label || block.text || block.href || 'Link')}</a></p>`
  if (block.type === 'callout') return `<div class="callout"><strong>${esc(block.title || block.kind || 'Note')}</strong><p>${esc(block.text || '')}</p></div>`
  if (block.type === 'table') return renderPreviewContentTable(block)
  if (block.type === 'example') return renderPreviewExample(block, graph, seen)
  return `<p>${esc(block.text || block.title || '')}</p>`
}

function renderPreviewContentTable(block) {
  const headers = block.headers || block.columns || []
  const rows = block.rows || []
  return `<table><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => {
    const cells = Array.isArray(row) ? row : headers.map((header) => row?.[header] ?? row?.[String(header).toLowerCase()] ?? '')
    return `<tr>${cells.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`
  }).join('')}</tbody></table>`
}

function renderPreviewExample(block, graph, seen) {
  const sectionId = block.section || block.preview_section || block.example_section || block.target_section
  const section = findSectionById(graph, sectionId)
  const key = section ? `${section.type}:${section.id}` : ''
  const preview = section && !seen.has(key)
    ? renderPreviewSection(section, graph, new Set([...seen, key]))
    : '<p class="empty">Preview section not found.</p>'
  return `<div class="example">
    ${block.title ? `<h3>${esc(block.title)}</h3>` : ''}
    ${block.text ? `<p>${esc(block.text)}</p>` : ''}
    ${preview}
    ${block.code ? `<pre><code>${esc(block.code)}</code></pre>` : ''}
  </div>`
}

function renderPreviewForm(section, graph) {
  const fields = previewFields(section, graph, 'fields')
  const controls = fields.map((field) => `<label class="field">
    <span>${esc(field.label || field.id)}</span>
    ${field.type === 'text' ? `<textarea rows="4" placeholder="${esc(sampleValue(field))}"></textarea>` : `<input type="${esc(inputType(field))}" placeholder="${esc(sampleValue(field))}" />`}
  </label>`).join('')
  return `<section id="${esc(section.id)}"><div class="section-inner">
    ${section.title ? `<h2>${esc(section.title)}</h2>` : ''}
    <form class="form-grid">${controls || '<p class="empty">No fields.</p>'}<button type="button">${esc(section.submit?.label || 'Submit')}</button></form>
  </div></section>`
}

function renderPreviewTable(section, graph) {
  const fields = previewFields(section, graph, 'columns')
  const headers = fields.length ? fields : [{ id: 'id', label: 'ID', type: 'number' }]
  return `<section id="${esc(section.id)}"><div class="section-inner">
    ${section.title ? `<h2>${esc(section.title)}</h2>` : ''}
    <table><thead><tr>${headers.map((field) => `<th>${esc(field.label || field.id)}</th>`).join('')}</tr></thead>
    <tbody><tr>${headers.map((field) => `<td>${esc(sampleValue(field))}</td>`).join('')}</tr></tbody></table>
  </div></section>`
}

function renderPreviewRecordDetail(section, graph) {
  const fields = previewFields(section, graph, 'fields')
  const items = fields.map((field) => `<div class="card"><strong>${esc(field.label || field.id)}</strong><p>${esc(sampleValue(field))}</p></div>`).join('')
  return `<section id="${esc(section.id)}"><div class="section-inner">
    ${section.title ? `<h2>${esc(section.title)}</h2>` : ''}
    <div class="detail-grid">${items || '<p class="empty">No fields.</p>'}</div>
  </div></section>`
}

function previewFields(section, graph, key) {
  const entity = section.entity ? graph.getEntity?.(section.entity) || graph.entities?.find((item) => item.id === section.entity) : null
  const refs = Array.isArray(section[key]) ? section[key] : []
  const fields = refs
    .map((ref) => typeof ref === 'string' ? entity?.fields?.find((field) => field.id === ref) || { id: ref, type: 'string' } : ref)
    .filter(Boolean)
  return fields.length ? fields : entity?.fields || []
}

function sampleValue(field) {
  if (field.values?.length) return field.values[0]
  if (field.default !== undefined) return field.default
  if (field.type === 'number') return '42'
  if (field.type === 'boolean') return 'true'
  if (field.type === 'datetime') return '2026-01-01'
  if (field.type === 'text') return `Sample ${field.label || field.id || 'text'}`
  return `Sample ${field.label || field.id || 'value'}`
}

function inputType(field) {
  if (field.type === 'number') return 'number'
  if (field.type === 'boolean') return 'checkbox'
  if (field.type === 'datetime') return 'datetime-local'
  return 'text'
}

function findSectionById(graph, id) {
  if (!id) return null
  for (const page of graph.pages || []) {
    const section = (page.sections || []).find((item) => item.id === id)
    if (section) return section
  }
  return null
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

