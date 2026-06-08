import { pascal, jsStr, t } from '../../../emit/util.js'
import { BANNER } from '../constants.js'

function defaultDetailPath(path) {
  const base = String(path || '').replace(/\/$/, '')
  return `${base || '/'}/:id`.replace('//:id', '/:id')
}

function routeParam(path) {
  const part = String(path || '').split('/').find((x) => x.startsWith(':'))
  return part ? part.slice(1) : 'id'
}

export function buildForm(name, graph, s, theme) {
  const entity = graph.getEntity(s.entity)
  const P = pascal(s.entity)
  const fieldRefs = (s.fields && s.fields.length) ? s.fields : (entity?.fields || []).map((f) => f.id)
  const inputs = fieldRefs.map((ref) => {
    const fid = typeof ref === 'string' ? ref : (ref.name || ref.id)
    const f = (entity?.fields || []).find((x) => x.id === fid) || { id: fid, type: 'string' }
    const label = f.label || pascal(fid)
    const req = f.required ? ' required' : ''
    if (f.type === 'text') return `          <Textarea name=${jsStr(fid)}${req} placeholder=${jsStr(label)} />`
    if (f.type === 'enum') {
      const opts = (f.values || []).map((v) => `            <option value=${jsStr(v)}>${t(v)}</option>`).join('\n')
      return `          <select name=${jsStr(fid)}${req} defaultValue=\"\" className=\"h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm\">
            <option value=\"\" disabled>${t(label)}</option>
${opts}
          </select>`
    }
    if (f.type === 'boolean') return `          <label className=\"flex items-center gap-2 text-sm\"><input type=\"checkbox\" name=${jsStr(fid)} className=\"h-4 w-4\" /><span>${t(label)}</span></label>`
    const inputType = f.type === 'number' ? 'number' : f.type === 'datetime' ? 'datetime-local' : 'text'
    return `          <Input type=\"${inputType}\" name=${jsStr(fid)}${req} placeholder=${jsStr(label)} />`
  }).join('\n')
  const success = s.submit?.success_message || 'Thank you. We will be in touch.'
  return `${BANNER}'use client'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { create${P} } from '@/lib/api/client'

export function ${name}() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    setStatus('loading')
    const payload = Object.fromEntries(new FormData(form).entries())
    const res = await create${P}(payload)
    setStatus(res.ok ? 'ok' : 'error')
    window.dispatchEvent(new CustomEvent('intentstack:toast', { detail: { type: res.ok ? 'success' : 'error', message: res.ok ? ${jsStr(success)} : 'Something went wrong. Please try again.' } }))
    if (res.ok) form.reset()
  }
  return (
    <section id=${jsStr(s.id)} className=\"${theme}\">
      <div className=\"mx-auto max-w-xl px-4\">
        <h2 className=\"mb-8 text-3xl font-semibold\">${t(s.title || 'Contact')}</h2>
        <form onSubmit={onSubmit} className=\"flex flex-col gap-3 rounded-lg border bg-card p-6 shadow-sm\">
${inputs}
          <Button type=\"submit\" disabled={status === 'loading'}>{status === 'loading' ? 'Sending…' : 'Submit'}</Button>
          {status === 'ok' && <p className=\"text-center text-sm text-green-600\">${t(success)}</p>}
          {status === 'error' && <p className=\"text-center text-sm text-destructive\">Something went wrong. Please try again.</p>}
        </form>
      </div>
    </section>
  )
}
`
}

export function buildTable(name, graph, s, page) {
  const entity = graph.getEntity(s.entity)
  const P = pascal(s.entity)
  const detailAction = (s.row_actions || []).find((a) => (a.type || a) === 'detail')
  const hasDetail = Boolean(detailAction)
  const hasEdit = (s.row_actions || []).some((a) => a.type === 'edit') &&
    graph.actions.some((a) => a.entity === s.entity && a.type === 'update_record')
  const hasDelete = (s.row_actions || []).some((a) => a.type === 'delete') &&
    graph.actions.some((a) => a.entity === s.entity && a.type === 'delete_record')
  const hasActions = hasDetail || hasEdit || hasDelete
  const cols = (s.columns && s.columns.length ? s.columns : (entity?.fields || []).map((f) => f.id))
    .map((c) => (typeof c === 'string' ? c : c.id))
  const ths = cols.map((c) => {
    const f = (entity?.fields || []).find((x) => x.id === c)
    return `                  <TableHead>${t(f?.label || pascal(c))}</TableHead>`
  }).join('\n')
  const tds = cols.map((c) => hasEdit
    ? `                    <TableCell>{editingId === Number(row.id) ? <input className=\"h-8 w-full rounded-md border px-2 text-sm\" value={String(draft[${jsStr(c)}] ?? '')} onChange={(e) => setDraftValue(${jsStr(c)}, e.currentTarget.value)} /> : String(row[${jsStr(c)}] ?? '')}</TableCell>`
    : `                    <TableCell>{String(row[${jsStr(c)}] ?? '')}</TableCell>`).join('\n')
  const actionsTh = hasActions ? `                    <TableHead className=\"w-40\">Actions</TableHead>\n` : ''
  const detailTarget = (typeof detailAction === 'object' && detailAction.target) || defaultDetailPath(page?.path)
  const detailButton = hasDetail ? `<a className=\"text-sm text-muted-foreground\" href={detailHref(${jsStr(detailTarget)}, row.id)}>Open</a>` : ''
  const editButtons = hasEdit ? `{editingId === Number(row.id) ? (
                        <>
                          <button type=\"button\" className=\"text-sm font-medium\" onClick={saveEdit}>Save</button>
                          <button type=\"button\" className=\"text-sm text-muted-foreground\" onClick={cancelEdit}>Cancel</button>
                        </>
                      ) : (
                        <button type=\"button\" className=\"text-sm text-muted-foreground\" onClick={() => startEdit(row)}>Edit</button>
                      )}` : ''
  const deleteButton = hasDelete ? `<button type=\"button\" className=\"text-sm text-destructive\" onClick={() => onDelete(Number(row.id))}>Delete</button>` : ''
  const actionsTd = hasActions ? `
                    <TableCell>
                      <div className=\"flex flex-wrap gap-3\">
                        ${detailButton}
                        ${editButtons}
                        ${deleteButton}
                      </div>
                    </TableCell>` : ''
  const importNames = [`list${P}`, hasEdit ? `update${P}` : null, hasDelete ? `delete${P}` : null].filter(Boolean).join(', ')
  const colSpan = cols.length + (hasActions ? 1 : 0)
  return `${BANNER}'use client'
import { useEffect, useState } from 'react'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { ${importNames} } from '@/lib/api/client'

export function ${name}() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)
  ${hasEdit ? `const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Record<string, unknown>>({})` : ''}
  async function loadRows() {
    setLoading(true)
    const nextRows = await list${P}()
    setRows(nextRows)
    setLoading(false)
  }
  ${hasEdit ? `function startEdit(row: Record<string, unknown>) {
    setEditingId(Number(row.id))
    setDraft(row)
  }
  function cancelEdit() {
    setEditingId(null)
    setDraft({})
  }
  function setDraftValue(key: string, value: unknown) {
    setDraft((current) => ({ ...current, [key]: value }))
  }
  async function saveEdit() {
    if (editingId == null) return
    const res = await update${P}(editingId, draft)
    if (res.ok) {
      cancelEdit()
      await loadRows()
    }
  }` : ''}
  ${hasDelete ? `async function onDelete(id: number) {
    if (!Number.isFinite(id)) return
    const res = await delete${P}(id)
    if (res.ok) await loadRows()
  }` : ''}
  ${hasDetail ? `function detailHref(pattern: string, id: unknown) {
    return pattern.replace(':id', encodeURIComponent(String(id)))
  }` : ''}
  useEffect(() => { void loadRows() }, [])
  return (
    <div className=\"mx-auto max-w-6xl px-4 py-6\">
      <div className=\"rounded-lg border\">
        <Table>
          <TableHeader>
            <TableRow>
${ths}
${actionsTh}            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={${colSpan}} className=\"text-center text-muted-foreground\">Loading…</TableCell></TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={${colSpan}} className=\"text-center text-muted-foreground\">No records yet</TableCell></TableRow>
            )}
            {!loading && rows.map((row, i) => (
              <TableRow key={i}>
${tds}
${actionsTd}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
`
}

export function buildRecordDetail(name, graph, s, page, theme) {
  const entity = graph.getEntity(s.entity)
  const P = pascal(s.entity)
  const param = routeParam(page?.path)
  const hasUpdate = Boolean(s.update?.action) &&
    graph.actions.some((a) => a.entity === s.entity && a.type === 'update_record')
  const fieldRefs = (s.fields && s.fields.length) ? s.fields : (entity?.fields || []).map((f) => f.id)
  const fields = fieldRefs.map((ref) => {
    const fid = typeof ref === 'string' ? ref : (ref.name || ref.id)
    const f = (entity?.fields || []).find((x) => x.id === fid)
    const label = f?.label || pascal(fid)
    return hasUpdate ? `            <label className=\"grid gap-2\">
            <span className=\"text-sm font-medium\">${t(label)}</span>
            <Input value={String(draft[${jsStr(fid)}] ?? '')} onChange={(e) => setDraftValue(${jsStr(fid)}, e.currentTarget.value)} />
          </label>` : `            <div>
            <div className=\"text-sm text-muted-foreground\">${t(label)}</div>
            <div className=\"font-medium\">{String(record?.[${jsStr(fid)}] ?? '')}</div>
          </div>`
  }).join('\n')
  const imports = hasUpdate ? `get${P}, update${P}` : `get${P}`
  const uiImports = hasUpdate
    ? `import { Input } from '@/components/ui/input'\nimport { Button } from '@/components/ui/button'\n`
    : ''
  const save = hasUpdate ? `
  function setDraftValue(key: string, value: unknown) {
    setDraft((current) => ({ ...current, [key]: value }))
  }
  async function saveRecord() {
    if (!Number.isFinite(recordId)) return
    setStatus('loading')
    const res = await update${P}(recordId, draft)
    setStatus(res.ok ? 'ok' : 'error')
    if (res.ok) {
      setRecord(res.data ?? draft)
      setDraft(res.data ?? draft)
    }
  }` : ''
  const button = hasUpdate ? `            <Button type=\"button\" onClick={saveRecord} disabled={status === 'loading'}>{status === 'loading' ? 'Saving...' : 'Save changes'}</Button>
          {status === 'ok' && <p className=\"text-sm text-green-600\">Saved.</p>}
          {status === 'error' && <p className=\"text-sm text-destructive\">Could not save changes.</p>}` : ''
  return `${BANNER}'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
${uiImports}import { ${imports} } from '@/lib/api/client'

export function ${name}() {
  const params = useParams()
  const rawId = params[${jsStr(param)}]
  const recordId = Number(Array.isArray(rawId) ? rawId[0] : rawId)
  const [record, setRecord] = useState<Record<string, unknown> | null>(null)
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  async function loadRecord() {
    if (!Number.isFinite(recordId)) {
      setStatus('error')
      return
    }
    setStatus('loading')
    const res = await get${P}(recordId)
    setStatus(res.ok ? 'idle' : 'error')
    setRecord(res.data ?? null)
    setDraft(res.data ?? {})
  }
${save}
  useEffect(() => { void loadRecord() }, [rawId])
  return (
    <section className=\"${theme}\">
      <div className=\"mx-auto max-w-2xl px-4\">
        <Card>
          <CardHeader><CardTitle>${t(s.title || entity?.id || 'Record')}</CardTitle></CardHeader>
          <CardContent className=\"grid gap-4\">
            {status === 'loading' && !record && <p className=\"text-sm text-muted-foreground\">Loading...</p>}
${fields}
${button}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
`
}
