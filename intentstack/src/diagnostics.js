// Structured diagnostics (PRD §25). Errors block build; warnings do not.
// Every diagnostic is consumable by an AI agent: { code, severity, message, path, suggestion, fix_hint }.

export class Diagnostics {
  constructor() { this.items = [] }
  push(d) { this.items.push(d); return d }
  error(code, message, opts = {}) { return this.push({ code, severity: 'error', message, ...opts }) }
  warn(code, message, opts = {}) { return this.push({ code, severity: 'warning', message, ...opts }) }
  info(code, message, opts = {}) { return this.push({ code, severity: 'info', message, ...opts }) }
  get errors() { return this.items.filter((i) => i.severity === 'error') }
  get warnings() { return this.items.filter((i) => i.severity === 'warning') }
  hasErrors() { return this.errors.length > 0 }
  toJSON() { return this.items }
  format() {
    if (this.items.length === 0) return '  (no diagnostics)'
    return this.items.map(formatOne).join('\n')
  }
}

function formatOne(d) {
  let s = `  [${d.severity.toUpperCase()} ${d.code}] ${d.message}`
  if (d.path) s += `\n      at:  ${d.path}`
  if (d.suggestion) s += `\n      hint: ${d.suggestion}`
  if (d.fix_hint) s += `\n      fix:  ${JSON.stringify(d.fix_hint)}`
  return s
}

// "Did you mean ...?" — return the closest candidate if it is reasonably close.
export function closest(target, candidates) {
  let best = null
  let bestD = Infinity
  for (const c of candidates) {
    const d = lev(String(target), String(c))
    if (d < bestD) { bestD = d; best = c }
  }
  if (best != null && bestD <= Math.max(2, Math.floor(String(best).length / 3))) return best
  return null
}

function lev(a, b) {
  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
  }
  return dp[m][n]
}
