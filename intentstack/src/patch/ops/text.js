import { resolvePath } from '../utils.js'

export const textOps = {
  'text.set'(ast, op) {
    const r = resolvePath(ast, op.target)
    if (!r || !r.obj) throw new Error(`cannot resolve target "${op.target}"`)
    const before = r.obj[r.key]
    r.obj[r.key] = op.value
    return { summary: `set ${op.target}`, before, after: op.value }
  },

  'text.append'(ast, op) {
    const r = resolvePath(ast, op.target)
    if (!r || !r.obj) throw new Error(`cannot resolve target "${op.target}"`)
    const before = r.obj[r.key] ?? ''
    r.obj[r.key] = String(before) + String(op.value ?? '')
    return { summary: `append ${op.target}`, before, after: r.obj[r.key] }
  },

  'text.replace'(ast, op) {
    const r = resolvePath(ast, op.target)
    if (!r || !r.obj) throw new Error(`cannot resolve target "${op.target}"`)
    const before = r.obj[r.key] ?? ''
    r.obj[r.key] = String(before).replace(String(op.search ?? ''), String(op.value ?? ''))
    return { summary: `replace ${op.target}`, before, after: r.obj[r.key] }
  },

  'text.clear'(ast, op) {
    const r = resolvePath(ast, op.target)
    if (!r || !r.obj) throw new Error(`cannot resolve target "${op.target}"`)
    const before = r.obj[r.key]
    r.obj[r.key] = ''
    return { summary: `clear ${op.target}`, before, after: '' }
  },
}
