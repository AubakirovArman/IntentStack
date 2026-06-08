import { BANNER_TS, jsStr, pascal, t } from '../../util.js'

export function buildForm(name, graph, s, RAD, DEN) {
  const entity = graph.getEntity(s.entity)
  const fnName = 'create' + pascal(s.entity)
  const fieldRefs = (s.fields && s.fields.length) ? s.fields : (entity?.fields || []).map((f) => f.id)
  const inputs = fieldRefs.map((ref) => {
    const fid = typeof ref === 'string' ? ref : (ref.name || ref.id)
    const f = (entity?.fields || []).find((x) => x.id === fid) || { id: fid, type: 'string' }
    const label = f.label || pascal(fid)
    const req = f.required ? ' required' : ''
    if (f.type === 'text') {
      return `          <textarea name=${jsStr(fid)}${req} placeholder=${jsStr(label)} className="textarea textarea-bordered w-full" />`
    }
    if (f.type === 'enum') {
      const opts = (f.values || []).map((v) => `            <option value=${jsStr(v)}>${t(v)}</option>`).join('\n')
      return `          <select name=${jsStr(fid)}${req} className="select select-bordered w-full" defaultValue="">
            <option value="" disabled>${t(label)}</option>
${opts}
          </select>`
    }
    if (f.type === 'boolean') {
      return `          <label className="label cursor-pointer justify-start gap-3"><input type="checkbox" name=${jsStr(fid)} className="checkbox" /><span>${t(label)}</span></label>`
    }
    const inputType = f.type === 'number' ? 'number' : f.type === 'datetime' ? 'datetime-local' : 'text'
    return `          <input type="${inputType}" name=${jsStr(fid)}${req} placeholder=${jsStr(label)} className="input input-bordered w-full" />`
  }).join('\n')
  const success = s.submit?.success_message || 'Thank you. We will be in touch.'
  return BANNER_TS + `import { useState } from 'react'
import type { FormEvent } from 'react'
import { ${fnName} } from '../api/client'

export function ${name}() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    setStatus('loading')
    const payload = Object.fromEntries(new FormData(form).entries())
    const res = await ${fnName}(payload)
    setStatus(res.ok ? 'ok' : 'error')
    window.dispatchEvent(new CustomEvent('intentstack:toast', { detail: { type: res.ok ? 'success' : 'error', message: res.ok ? ${jsStr(success)} : 'Something went wrong. Please try again.' } }))
    if (res.ok) form.reset()
  }
  return (
    <section id=${jsStr(s.id)} className="${DEN.section} bg-base-100">
      <div className="max-w-xl mx-auto px-4">
        <h2 className="text-3xl font-semibold text-center mb-8">${t(s.title || 'Contact')}</h2>
        <form onSubmit={onSubmit} className="card bg-base-100 ${RAD} border border-base-200 shadow-sm p-6 flex flex-col gap-3">
${inputs}
          <button type="submit" className="btn btn-primary w-full gap-2 transition hover:scale-[1.01] ${RAD}" disabled={status === 'loading'}>
            {status === 'loading' ? 'Sending...' : 'Submit'}
          </button>
          {status === 'ok' && <p className="text-success text-center">${t(success)}</p>}
          {status === 'error' && <p className="text-error text-center">Something went wrong. Please try again.</p>}
        </form>
      </div>
    </section>
  )
}
`
}

export function buildTable(name, graph, s, page, RAD) {
  const entity = graph.getEntity(s.entity)
  const fnName = 'list' + pascal(s.entity)
  const updateFn = 'update' + pascal(s.entity)
  const deleteFn = 'delete' + pascal(s.entity)
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
    return `              <th>${t(f?.label || pascal(c))}</th>`
  }).join('\n')
  const tds = cols.map((c) => hasEdit
    ? `                <td>{editingId === Number(row.id) ? <input className="input input-bordered input-sm w-full" value={String(draft[${jsStr(c)}] ?? '')} onChange={(e) => setDraftValue(${jsStr(c)}, e.currentTarget.value)} /> : String(row[${jsStr(c)}] ?? '')}</td>`
    : `                <td>{String(row[${jsStr(c)}] ?? '')}</td>`).join('\n')
  const actionsTh = hasActions ? `              <th className="w-40">Actions</th>\n` : ''
  const detailTarget = (typeof detailAction === 'object' && detailAction.target) || defaultDetailPath(page?.path)
  const detailButton = hasDetail ? `<a className="btn btn-ghost btn-xs" href={detailHref(${jsStr(detailTarget)}, row.id)}>Open</a>` : ''
  const editButtons = hasEdit ? `{editingId === Number(row.id) ? (
                    <>
                      <button type="button" className="btn btn-primary btn-xs" onClick={saveEdit}>Save</button>
                      <button type="button" className="btn btn-ghost btn-xs" onClick={cancelEdit}>Cancel</button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => startEdit(row)}>Edit</button>
                  )}` : ''
  const deleteButton = hasDelete ? `<button type="button" className="btn btn-ghost btn-xs text-error" onClick={() => onDelete(Number(row.id))}>Delete</button>` : ''
  const actionsTd = hasActions ? `
                <td>
                  <div className="flex flex-wrap gap-2">
                    ${detailButton}
                    ${editButtons}
                    ${deleteButton}
                  </div>
                </td>` : ''
  const importNames = [fnName, hasEdit ? updateFn : null, hasDelete ? deleteFn : null].filter(Boolean).join(', ')
  const colSpan = cols.length + (hasActions ? 1 : 0)
  return BANNER_TS + `import { useEffect, useState } from 'react'
import { ${importNames} } from '../api/client'

export function ${name}() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)
  ${hasEdit ? `const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Record<string, unknown>>({})` : ''}
  async function loadRows() {
    setLoading(true)
    const nextRows = await ${fnName}()
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
    const res = await ${updateFn}(editingId, draft)
    if (res.ok) {
      cancelEdit()
      await loadRows()
    }
  }` : ''}
  ${hasDelete ? `async function onDelete(id: number) {
    if (!Number.isFinite(id)) return
    const res = await ${deleteFn}(id)
    if (res.ok) await loadRows()
  }` : ''}
  ${hasDetail ? `function detailHref(pattern: string, id: unknown) {
    return pattern.replace(':id', encodeURIComponent(String(id)))
  }` : ''}
  useEffect(() => { void loadRows() }, [])
  return (
    <section className="p-6">
      <div className="overflow-x-auto bg-base-100 ${RAD} border border-base-200">
        <table className="table">
          <thead>
            <tr>
${ths}
${actionsTh}            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={${colSpan}} className="text-center py-8"><span className="loading loading-spinner" /></td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={${colSpan}} className="text-center opacity-60 py-8">No records yet</td></tr>
            )}
            {!loading && rows.map((row, i) => (
              <tr key={i}>
${tds}
${actionsTd}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
`
}

export function buildRecordDetail(name, graph, s, page, RAD, DEN) {
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
    return hasUpdate ? `          <label className="form-control">
            <span className="label-text">${t(label)}</span>
            <input className="input input-bordered" value={String(draft[${jsStr(fid)}] ?? '')} onChange={(e) => setDraftValue(${jsStr(fid)}, e.currentTarget.value)} />
          </label>` : `          <div>
            <div className="text-sm opacity-60">${t(label)}</div>
            <div className="font-medium">{String(record?.[${jsStr(fid)}] ?? '')}</div>
          </div>`
  }).join('\n')
  const imports = hasUpdate ? `get${P}, update${P}` : `get${P}`
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
  const button = hasUpdate ? `          <button type="button" className="btn btn-primary ${RAD}" onClick={saveRecord} disabled={status === 'loading'}>{status === 'loading' ? 'Saving...' : 'Save changes'}</button>
          {status === 'ok' && <p className="text-success text-sm">Saved.</p>}
          {status === 'error' && <p className="text-error text-sm">Could not save changes.</p>}` : ''
  return BANNER_TS + `import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ${imports} } from '../api/client'

export function ${name}() {
  const params = useParams()
  const recordId = Number(params[${jsStr(param)}])
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
  useEffect(() => { void loadRecord() }, [params[${jsStr(param)}]])
  return (
    <section className="${DEN.section} bg-base-100">
      <div className="mx-auto max-w-2xl px-4">
        <div className="card bg-base-100 ${RAD} border border-base-200 shadow-sm">
          <div className="card-body gap-4">
            <h2 className="card-title">${t(s.title || entity?.id || 'Record')}</h2>
            {status === 'loading' && !record && <span className="loading loading-spinner" />}
${fields}
${button}
          </div>
        </div>
      </div>
    </section>
  )
}
`
}

export function routeParam(path) {
  const part = String(path || '').split('/').find((x) => x.startsWith(':'))
  return part ? part.slice(1) : 'id'
}

function defaultDetailPath(path) {
  const base = String(path || '').replace(/\/$/, '')
  return `${base || '/'}/:id`.replace('//:id', '/:id')
}
