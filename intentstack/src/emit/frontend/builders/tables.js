import { BANNER_TS, jsStr, pascal, t } from '../../util.js'

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
  const labels = Object.fromEntries(cols.map((c) => {
    const f = (entity?.fields || []).find((x) => x.id === c)
    return [c, f?.label || pascal(c)]
  }))
  const ths = cols.map((c) => `              <th>${sortButton(c, labels[c])}</th>`).join('\n')
  const tds = cols.map((c) => hasEdit
    ? `                <td>{editingId === Number(row.id) ? <input className="input input-bordered input-sm w-full" value={String(draft[${jsStr(c)}] ?? '')} onChange={(e) => setDraftValue(${jsStr(c)}, e.currentTarget.value)} /> : String(row[${jsStr(c)}] ?? '')}</td>`
    : `                <td>{String(row[${jsStr(c)}] ?? '')}</td>`).join('\n')
  const actionsTh = hasActions ? `              <th className="w-40">Actions</th>\n` : ''
  const detailTarget = (typeof detailAction === 'object' && detailAction.target) || defaultDetailPath(page?.path)
  const detailButton = hasDetail ? `<a className="btn btn-ghost btn-xs" href={detailHref(${jsStr(detailTarget)}, row.id)}>Open</a>` : ''
  const editButtons = editButtonsTsx(hasEdit, updateFn)
  const deleteButton = hasDelete ? `<button type="button" className="btn btn-ghost btn-xs text-error" onClick={() => onDelete(Number(row.id))}>Delete</button>` : ''
  const actionsTd = hasActions ? `
                <td>
                  <div className="flex flex-wrap gap-2">
                    ${detailButton}
                    ${editButtons}
                    ${deleteButton}
                  </div>
                </td>` : ''
  const imports = [fnName, hasEdit ? updateFn : null, hasDelete ? deleteFn : null].filter(Boolean).join(', ')
  const colSpan = cols.length + (hasActions ? 1 : 0)
  return BANNER_TS + `import { useEffect, useMemo, useState } from 'react'
import { ${imports} } from '../api/client'

const COLUMNS = ${JSON.stringify(cols)}

export function ${name}() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string>('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const pageSize = 10
  ${hasEdit ? `const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Record<string, unknown>>({})` : ''}
  async function loadRows() {
    setLoading(true)
    const nextRows = await ${fnName}()
    setRows(nextRows)
    setLoading(false)
  }
${editHelpers(hasEdit, updateFn)}
${deleteHelper(hasDelete, deleteFn)}
${detailHelper(hasDetail)}
  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((current) => current === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => COLUMNS.some((col) => String(row[col] ?? '').toLowerCase().includes(q)))
  }, [rows, search])
  const sortedRows = useMemo(() => {
    const next = [...filteredRows]
    if (!sortKey) return next
    return next.sort((a, b) => compareValues(a[sortKey], b[sortKey]) * (sortDir === 'asc' ? 1 : -1))
  }, [filteredRows, sortKey, sortDir])
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize))
  const pageRows = sortedRows.slice((page - 1) * pageSize, page * pageSize)
  function downloadRows(format: 'csv' | 'json') {
    const body = format === 'json' ? JSON.stringify(sortedRows, null, 2) : toCsv(sortedRows)
    const blob = new Blob([body], { type: format === 'json' ? 'application/json' : 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = '${String(s.entity || 'records').toLowerCase()}.' + format
    link.click()
    URL.revokeObjectURL(url)
  }
  useEffect(() => { void loadRows() }, [])
  useEffect(() => { setPage(1) }, [search, sortKey, sortDir])
  return (
    <section className="p-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="input input-bordered input-sm w-full max-w-xs" value={search} onChange={(e) => setSearch(e.currentTarget.value)} placeholder="Search records" />
        <button type="button" className="btn btn-outline btn-sm" onClick={() => downloadRows('csv')}>CSV</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => downloadRows('json')}>JSON</button>
      </div>
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
            {!loading && pageRows.length === 0 && (
              <tr><td colSpan={${colSpan}} className="text-center opacity-60 py-8">No records yet</td></tr>
            )}
            {!loading && pageRows.map((row, i) => (
              <tr key={i}>
${tds}
${actionsTd}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-sm">
        <span>Page {page} of {totalPages}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>Prev</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>Next</button>
      </div>
    </section>
  )
}

function compareValues(a: unknown, b: unknown) {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' })
}

function toCsv(rows: Array<Record<string, unknown>>) {
  const esc = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"'
  return [COLUMNS.join(','), ...rows.map((row) => COLUMNS.map((col) => esc(row[col])).join(','))].join('\\n')
}
`
}

function sortButton(column, label) {
  return `<button type="button" className="btn btn-ghost btn-xs justify-start px-0" onClick={() => toggleSort(${jsStr(column)})}>${t(label)} {sortKey === ${jsStr(column)} ? (sortDir === 'asc' ? 'ASC' : 'DESC') : ''}</button>`
}

function editButtonsTsx(enabled) {
  return enabled ? `{editingId === Number(row.id) ? (
                    <>
                      <button type="button" className="btn btn-primary btn-xs" onClick={saveEdit}>Save</button>
                      <button type="button" className="btn btn-ghost btn-xs" onClick={cancelEdit}>Cancel</button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => startEdit(row)}>Edit</button>
                  )}` : ''
}

function editHelpers(enabled, updateFn) {
  return enabled ? `  function startEdit(row: Record<string, unknown>) {
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
  }` : ''
}

function deleteHelper(enabled, deleteFn) {
  return enabled ? `  async function onDelete(id: number) {
    if (!Number.isFinite(id)) return
    const res = await ${deleteFn}(id)
    if (res.ok) await loadRows()
  }` : ''
}

function detailHelper(enabled) {
  return enabled ? `  function detailHref(pattern: string, id: unknown) {
    return pattern.replace(':id', encodeURIComponent(String(id)))
  }` : ''
}

function defaultDetailPath(path) {
  const base = String(path || '').replace(/\/$/, '')
  return `${base || '/'}/:id`.replace('//:id', '/:id')
}
