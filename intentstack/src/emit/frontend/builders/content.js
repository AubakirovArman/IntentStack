import { BANNER_TS, jsStr, t } from '../../util.js'

export function buildContent(name, s, RAD, DEN, page, sectionNameFor) {
  const headings = (s.blocks || [])
    .flatMap((block) => {
      if (block.type === 'heading' && block.text) return [{ id: block.id || slug(block.text), text: block.text, level: Number(block.level) || 2 }]
      if (block.type === 'example' && block.title) return [{ id: block.id || slug(block.title), text: block.title, level: Number(block.level) || 3 }]
      return []
    })
  const showToc = s.toc !== false && headings.length > 1
  const exampleComponents = [...new Set((s.blocks || [])
    .filter((block) => block.type === 'example' && block.section)
    .map((block) => sectionNameFor(block.section, page))
    .filter(Boolean))]
  const imports = exampleComponents.map((component) => `import { ${component} } from './${component}'`).join('\n')
  const blocks = (s.blocks || []).map((block) => renderContentBlock(block, RAD, page, sectionNameFor)).join('\n')
  const title = s.title ? `          <h1 className="text-4xl font-bold tracking-tight">${t(s.title)}</h1>\n` : ''
  const toc = showToc ? `        <aside className="hidden lg:block">
          <nav className="sticky top-24 rounded-lg border border-base-200 bg-base-100 p-4 text-sm">
            <p className="mb-3 font-medium opacity-70">On this page</p>
${headings.map((h) => `            <a className="${h.level > 2 ? 'ml-3 ' : ''}block py-1 opacity-70 hover:opacity-100" href="#${slug(h.id)}">${t(h.text)}</a>`).join('\n')}
          </nav>
        </aside>
` : ''
  const grid = showToc ? 'grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]' : 'grid'
  const max = page?.layout === 'docs' ? 'max-w-6xl' : 'max-w-4xl'
  return BANNER_TS + `${imports ? `${imports}\n\n` : ''}export function ${name}() {
  return (
    <section id=${jsStr(s.id)} className="${DEN.section} bg-base-100">
      <div className="${max} mx-auto px-4 ${grid}">
${toc}        <article className="space-y-6">
${title}${blocks}
        </article>
      </div>
    </section>
  )
}
`
}

function renderContentBlock(block, RAD, page, sectionNameFor) {
  if (block.type === 'heading') {
    const level = Math.min(Math.max(Number(block.level) || 2, 2), 4)
    const id = slug(block.id || block.text || '')
    const cls = level === 2 ? 'text-2xl font-semibold tracking-tight pt-4' : level === 3 ? 'text-xl font-semibold pt-3' : 'text-lg font-semibold pt-2'
    const Tag = `h${level}`
    return `          <${Tag} id=${jsStr(id)} className="${cls}">${t(block.text)}</${Tag}>`
  }
  if (block.type === 'list') {
    const items = (block.items || []).map((item) => `            <li>${t(item)}</li>`).join('\n')
    return `          <ul className="list-disc space-y-2 pl-6 opacity-80">
${items}
          </ul>`
  }
  if (block.type === 'code') {
    const language = block.language || 'text'
    const label = block.language ? `          <div className="text-xs uppercase tracking-wide opacity-60">${t(block.language)}</div>\n` : ''
    return `${label}          <pre data-language=${JSON.stringify(language)} className="${RAD} overflow-x-auto border border-base-200 bg-base-200 p-4 text-sm"><code className=${JSON.stringify(`language-${language}`)}>${t(block.code)}</code></pre>`
  }
  if (block.type === 'example') {
    const component = block.section ? sectionNameFor(block.section, page) : null
    const id = slug(block.id || block.title || block.section || 'example')
    const title = block.title ? `            <h3 className="text-xl font-semibold">${t(block.title)}</h3>\n` : ''
    const text = block.text ? `            <p className="text-base leading-7 opacity-80">${t(block.text)}</p>\n` : ''
    const label = block.language ? `              <div className="text-xs uppercase tracking-wide opacity-60">${t(block.language)}</div>\n` : ''
    const preview = component
      ? `              <${component} />`
      : `              <p className="p-4 text-sm opacity-70">Missing example section: ${t(block.section)}</p>`
    return `          <div id=${jsStr(id)} className="${RAD} overflow-hidden border border-base-200 bg-base-100 shadow-sm">
            <div className="space-y-2 border-b border-base-200 p-4">
${title}${text}            </div>
            <div className="bg-base-200/40 [&_section]:py-8 [&_section_.max-w-6xl]:max-w-none">
${preview}
            </div>
            <div className="border-t border-base-200 bg-base-200 p-4">
${label}              <pre data-language=${JSON.stringify(block.language || 'text')} className="overflow-x-auto text-sm"><code className=${JSON.stringify(`language-${block.language || 'text'}`)}>${t(block.code)}</code></pre>
            </div>
          </div>`
  }
  if (block.type === 'link') {
    return `          <p><a href=${jsStr(block.href)} className="link link-primary font-medium">${t(block.text)}</a></p>`
  }
  if (block.type === 'callout') {
    const title = block.title ? `            <p className="font-semibold">${t(block.title)}</p>\n` : ''
    return `          <div className="${RAD} border border-info/30 bg-info/10 p-4">
${title}            <p className="leading-7 opacity-80">${t(block.text)}</p>
          </div>`
  }
  if (block.type === 'table') {
    const columns = block.columns || []
    const head = columns.map((column) => `              <th>${t(column)}</th>`).join('\n')
    const rows = (block.rows || []).map((row) => `            <tr>
${columns.map((column, index) => `              <td>${t(tableCell(row, column, index))}</td>`).join('\n')}
            </tr>`).join('\n')
    return `          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
${head}
                </tr>
              </thead>
              <tbody>
${rows}
              </tbody>
            </table>
          </div>`
  }
  return `          <p className="text-base leading-7 opacity-80">${t(block.text)}</p>`
}

function tableCell(row, column, index) {
  if (Array.isArray(row)) return row[index]
  if (row && typeof row === 'object') return row[column] ?? row[slug(column)] ?? ''
  return ''
}

export function sectionNameFor(sectionNameProvider, page) {
  return (sectionId) => sectionNameProvider(sectionId, page)
}

export function slug(value) {
  return String(value || 'section')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'section'
}

export function buildFooter(name, s) {
  return BANNER_TS + `export function ${name}() {
  return (
    <footer className="footer footer-center bg-base-200 text-base-content p-8">
      <aside><p>${t(s.text || '© ' + new Date().getFullYear())}</p></aside>
    </footer>
  )
}
`
}
