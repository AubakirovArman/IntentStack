import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const esc = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

function renderMarkdown(md) {
  const lines = md.split(/\r?\n/)
  const out = []
  let inCode = false
  let code = []
  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCode) {
        out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`)
        code = []
        inCode = false
      } else {
        inCode = true
      }
      continue
    }
    if (inCode) {
      code.push(line)
      continue
    }
    if (line.startsWith('# ')) out.push(`<h1>${esc(line.slice(2))}</h1>`)
    else if (line.startsWith('## ')) out.push(`<h2>${esc(line.slice(3))}</h2>`)
    else if (line.startsWith('### ')) out.push(`<h3>${esc(line.slice(4))}</h3>`)
    else if (line.trim() === '') out.push('')
    else if (line.startsWith('- ')) out.push(`<p class="li">${esc(line.slice(2))}</p>`)
    else out.push(`<p>${esc(line)}</p>`)
  }
  if (inCode) out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`)
  return out.join('\n')
}

function page(title, body, nav) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <style>
      body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #0f172a; background: #f8fafc; }
      header { padding: 28px 32px; background: #fff; border-bottom: 1px solid #e2e8f0; }
      main { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 24px; padding: 24px 32px; }
      nav { position: sticky; top: 24px; align-self: start; display: grid; gap: 8px; }
      nav a { color: #334155; text-decoration: none; padding: 8px 10px; border-radius: 6px; }
      nav a:hover { background: #e2e8f0; }
      article { max-width: 900px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 28px; }
      h1 { margin-top: 0; font-size: 32px; }
      h2 { margin-top: 32px; font-size: 22px; }
      p { line-height: 1.65; }
      .li { padding-left: 18px; position: relative; }
      .li::before { content: "•"; position: absolute; left: 0; color: #64748b; }
      pre { overflow-x: auto; background: #0f172a; color: #e2e8f0; border-radius: 8px; padding: 16px; }
      @media (max-width: 760px) { main { grid-template-columns: 1fr; padding: 16px; } nav { position: static; } }
    </style>
  </head>
  <body>
    <header><strong>IntentStack Docs</strong></header>
    <main>
      <nav>${nav}</nav>
      <article>${body}</article>
    </main>
  </body>
</html>
`
}

export function generateDocsSite(rootDir, outDir) {
  const docsDir = join(rootDir, 'docs')
  const files = []
  const readme = join(rootDir, 'README.md')
  if (existsSync(readme)) files.push(readme)
  if (existsSync(docsDir)) {
    for (const name of readdirSync(docsDir).sort()) {
      if (name.endsWith('.md')) files.push(join(docsDir, name))
    }
  }
  mkdirSync(outDir, { recursive: true })
  const pages = files.map((file, index) => ({
    file,
    href: index === 0 ? 'index.html' : basename(file, '.md') + '.html',
    title: basename(file),
  }))
  const nav = pages.map((p) => `<a href="${p.href}">${esc(p.title)}</a>`).join('\n')
  for (const p of pages) {
    const md = readFileSync(p.file, 'utf8')
    writeFileSync(join(outDir, p.href), page(p.title, renderMarkdown(md), nav))
  }
  return pages.map((p) => p.href)
}
