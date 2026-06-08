import { pascal, jsStr, t } from '../../../emit/util.js'
import { BANNER } from '../constants.js'

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
  const labels = Object.fromEntries(cols.map((c) => {
    const f = (entity?.fields || []).find((x) => x.id === c)
    return [c, f?.label || pascal(c)]
  }))
  const ths = cols.map((c) => `                  <TableHead>${sortButton(c, labels[c])}</TableHead>`).join('\n')
  const tds = cols.map((c) => hasEdit
    ? `                    <TableCell>{editingId === Number(row.id) ? <input className=\"h-8 w-full rounded-md border px-2 text-sm\" value={String(draft[${jsStr(c)}] ?? '')} onChange={(e) => setDraftValue(${jsStr(c)}, e.currentTarget.value)} /> : String(row[${jsStr(c)}] ?? '')}</TableCell>`
    : `                    <TableCell>{String(row[${jsStr(c)}] ?? '')}</TableCell>`).join('\n')
  const actionsTh = hasActions ? `                    <TableHead className=\"w-40\">Actions</TableHead>\n` : ''
  const detailTarget = (typeof detailAction === 'object' && detailAction.target) || defaultDetailPath(page?.path)
  const detailButton = hasDetail ? `<a className=\"text-sm text-muted-foreground\" href={detailHref(${jsStr(detailTarget)}, row.id)}>Open</a>` : ''
  const actionsTd = actionCell(hasActions, detailButton, editButtonsTsx(hasEdit), hasDelete)
  const imports = [`list${P}`, hasEdit ? `update${P}` : null, hasDelete ? `delete${P}` : null].filter(Boolean).join(', ')
  const colSpan = cols.length + (hasActions ? 1 : 0)
  return `${BANNER}'use client'
import { useEffect, useMemo, useState } from 'react'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { ${imports} } from '@/lib/api/client'

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
    const nextRows = await list${P}()
    setRows(nextRows)
    setLoading(false)
  }
${editHelpers(hasEdit, `update${P}`)}
${deleteHelper(hasDelete, `delete${P}`)}
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
    <div className=\"mx-auto max-w-6xl px-4 py-6\">
      <div className=\"mb-3 flex flex-wrap items-center gap-2\">
        <input className=\"h-9 w-full max-w-xs rounded-md border px-3 text-sm\" value={search} onChange={(e) => setSearch(e.currentTarget.value)} placeholder=\"Search records\" />
        <button type=\"button\" className=\"rounded-md border px-3 py-1 text-sm\" onClick={() => downloadRows('csv')}>CSV</button>
        <button type=\"button\" className=\"rounded-md border px-3 py-1 text-sm\" onClick={() => downloadRows('json')}>JSON</button>
      </div>
      <div className=\"rounded-lg border\">
        <Table>
          <TableHeader>
            <TableRow>
${ths}
${actionsTh}            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={${colSpan}} className=\"text-center text-muted-foreground\">Loading...</TableCell></TableRow>
            )}
            {!loading && pageRows.length === 0 && (
              <TableRow><TableCell colSpan={${colSpan}} className=\"text-center text-muted-foreground\">No records yet</TableCell></TableRow>
            )}
            {!loading && pageRows.map((row, i) => (
              <TableRow key={i}>
${tds}
${actionsTd}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className=\"mt-3 flex items-center justify-end gap-2 text-sm\">
        <span>Page {page} of {totalPages}</span>
        <button type=\"button\" className=\"rounded-md border px-3 py-1\" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>Prev</button>
        <button type=\"button\" className=\"rounded-md border px-3 py-1\" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>Next</button>
      </div>
    </div>
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
  return `<button type=\"button\" className=\"text-left text-sm font-medium\" onClick={() => toggleSort(${jsStr(column)})}>${t(label)} {sortKey === ${jsStr(column)} ? (sortDir === 'asc' ? 'ASC' : 'DESC') : ''}</button>`
}

function editButtonsTsx(enabled) {
  return enabled ? `{editingId === Number(row.id) ? (
                        <>
                          <button type=\"button\" className=\"text-sm font-medium\" onClick={saveEdit}>Save</button>
                          <button type=\"button\" className=\"text-sm text-muted-foreground\" onClick={cancelEdit}>Cancel</button>
                        </>
                      ) : (
                        <button type=\"button\" className=\"text-sm text-muted-foreground\" onClick={() => startEdit(row)}>Edit</button>
                      )}` : ''
}

function actionCell(enabled, detailButton, editButtons, hasDelete) {
  if (!enabled) return ''
  const deleteButton = hasDelete ? `<button type=\"button\" className=\"text-sm text-destructive\" onClick={() => onDelete(Number(row.id))}>Delete</button>` : ''
  return `
                    <TableCell>
                      <div className=\"flex flex-wrap gap-3\">
                        ${detailButton}
                        ${editButtons}
                        ${deleteButton}
                      </div>
                    </TableCell>`
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
