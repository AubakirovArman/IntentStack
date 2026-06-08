import { jsStr, t } from '../../../emit/util.js'
import { BANNER } from '../constants.js'

export function sectionNameFor(sectionNames, page, sectionId) {
  return sectionNames.get(`${page.id}:${sectionId}`) || sectionNames.get(sectionId)
}

function slug(value) {
  return String(value || 'section')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'section'
}

export function buildContent(name, s, theme, page, sectionNames) {
  const headings = (s.blocks || [])
    .flatMap((block) => {
      if (block.type === 'heading' && block.text) return [{ id: block.id || slug(block.text), text: block.text, level: Number(block.level) || 2 }]
      if (block.type === 'example' && block.title) return [{ id: block.id || slug(block.title), text: block.title, level: Number(block.level) || 3 }]
      return []
    })
  const showToc = s.toc !== false && headings.length > 1
  const exampleComponents = [...new Set((s.blocks || [])
    .filter((block) => block.type === 'example' && block.section)
    .map((block) => sectionNameFor(sectionNames, page, block.section))
    .filter(Boolean))]
  const imports = exampleComponents.map((component) => `import { ${component} } from './${component}'`).join('\n')
  const blocks = (s.blocks || []).map((block) => renderContentBlock(block, page, sectionNames)).join('\n')
  const title = s.title ? `          <h1 className="text-4xl font-bold tracking-tight">${t(s.title)}</h1>\n` : ''
  const toc = showToc ? `        <aside className="hidden lg:block">
            <nav className="sticky top-24 rounded-lg border bg-card p-4 text-sm">
              <p className="mb-3 font-medium text-muted-foreground">On this page</p>
${headings.map((h) => `              <a className="${h.level > 2 ? 'ml-3 ' : ''}block py-1 text-muted-foreground transition-colors hover:text-foreground" href="#${slug(h.id)}">${t(h.text)}</a>`).join('\n')}
            </nav>
        </aside>
` : ''
  const grid = showToc ? 'grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]' : 'grid'
  const max = page?.layout === 'docs' ? 'max-w-6xl' : 'max-w-4xl'
  return `${BANNER}${imports ? `${imports}\n\n` : ''}export function ${name}() {
  return (
    <section id=${jsStr(s.id)} className="${theme}">
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

function renderContentBlock(block, page, sectionNames) {
  if (block.type === 'heading') {
    const level = Math.min(Math.max(Number(block.level) || 2, 2), 4)
    const id = slug(block.id || block.text || '')
    const cls = level === 2 ? 'pt-4 text-2xl font-semibold tracking-tight' : level === 3 ? 'pt-3 text-xl font-semibold' : 'pt-2 text-lg font-semibold'
    const Tag = `h${level}`
    return `          <${Tag} id=${jsStr(id)} className="${cls}">${t(block.text)}</${Tag}>`
  }
  if (block.type === 'list') {
    const items = (block.items || []).map((item) => `            <li>${t(item)}</li>`).join('\n')
    return `          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
${items}
          </ul>`
  }
  if (block.type === 'code') {
    const language = block.language || 'text'
    const label = block.language ? `          <div className="text-xs uppercase tracking-wide text-muted-foreground">${t(block.language)}</div>\n` : ''
    return `${label}          <pre data-language=${JSON.stringify(language)} className="overflow-x-auto rounded-lg border bg-muted p-4 text-sm"><code className=${JSON.stringify(`language-${language}`)}>${t(block.code)}</code></pre>`
  }
  if (block.type === 'example') {
    const component = block.section ? sectionNameFor(sectionNames, page, block.section) : null
    const id = slug(block.id || block.title || block.section || 'example')
    const title = block.title ? `            <h3 className=\"text-xl font-semibold\">${t(block.title)}</h3>\n` : ''
    const text = block.text ? `            <p className=\"text-base leading-7 text-muted-foreground\">${t(block.text)}</p>\n` : ''
    const label = block.language ? `              <div className=\"text-xs uppercase tracking-wide text-muted-foreground\">${t(block.language)}</div>\n` : ''
    const preview = component
      ? `              <${component} />`
      : `              <p className=\"p-4 text-sm text-muted-foreground\">Missing example section: ${t(block.section)}</p>`
    return `          <div id=${jsStr(id)} className=\"overflow-hidden rounded-lg border bg-card shadow-sm\">
            <div className=\"space-y-2 border-b p-4\">
${title}${text}            </div>
            <div className=\"bg-muted/30 [&_section]:py-8 [&_section_.max-w-6xl]:max-w-none\">
${preview}
            </div>
            <div className=\"border-t bg-muted p-4\">
${label}              <pre data-language=${JSON.stringify(block.language || 'text')} className=\"overflow-x-auto text-sm\"><code className=${JSON.stringify(`language-${block.language || 'text'}`)}>${t(block.code)}</code></pre>
            </div>
          </div>`
  }
  if (block.type === 'link') {
    return `          <p><a href=${jsStr(block.href)} className=\"font-medium text-primary underline-offset-4 hover:underline\">${t(block.text)}</a></p>`
  }
  if (block.type === 'callout') {
    const title = block.title ? `            <p className=\"font-semibold\">${t(block.title)}</p>\n` : ''
    return `          <div className=\"rounded-lg border bg-muted/50 p-4\">
${title}            <p className=\"leading-7 text-muted-foreground\">${t(block.text)}</p>
          </div>`
  }
  if (block.type === 'table') {
    const columns = block.columns || []
    const head = columns.map((column) => `              <th className=\"px-4 py-3 text-left font-medium\">${t(column)}</th>`).join('\n')
    const rows = (block.rows || []).map((row) => `            <tr className=\"border-t\">
${columns.map((column, index) => `              <td className=\"px-4 py-3\">${t(tableCell(row, column, index))}</td>`).join('\n')}
            </tr>`).join('\n')
    return `          <div className=\"overflow-x-auto rounded-lg border\">
            <table className=\"w-full text-sm\">
              <thead className=\"bg-muted/50\">
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
  return `          <p className="text-base leading-7 text-muted-foreground">${t(block.text)}</p>`
}

function tableCell(row, column, index) {
  if (Array.isArray(row)) return row[index]
  if (row && typeof row === 'object') return row[column] ?? row[slug(column)] ?? ''
  return ''
}
