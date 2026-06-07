import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const PRETTIER_EXT = /\.(css|html|js|jsx|json|md|mjs|cjs|ts|tsx|yaml|yml)$/i

export function formatGeneratedFiles(outDir, written, opts = {}) {
  if (opts.enabled === false) return [{ tool: 'prettier', status: 'skipped', reason: 'disabled' }]
  const rows = []
  const prettierFiles = written.filter((file) => PRETTIER_EXT.test(file))
  if (prettierFiles.length) {
    const prettier = localBin(opts.toolRoot || outDir, 'prettier')
    if (prettier) {
      const res = runCommand(prettier, ['--write', '--log-level', 'warn', ...prettierFiles], outDir)
      rows.push(commandRow('prettier', res, `${prettierFiles.length} file(s)`))
    } else {
      rows.push({ tool: 'prettier', status: 'skipped', reason: 'not installed' })
    }
  }

  const rustFiles = written.filter((file) => /\.rs$/i.test(file))
  if (rustFiles.length) {
    const rustfmt = commandAvailable('rustfmt') ? 'rustfmt' : null
    if (rustfmt) {
      const res = spawnSync(rustfmt, rustFiles, { cwd: outDir, encoding: 'utf8', stdio: 'pipe' })
      rows.push(commandRow('rustfmt', res, `${rustFiles.length} file(s)`))
    } else {
      rows.push({ tool: 'rustfmt', status: 'skipped', reason: 'not installed' })
    }
  }

  return rows.length ? rows : [{ tool: 'format', status: 'skipped', reason: 'no supported files' }]
}

function runCommand(command, args, cwd) {
  if (process.platform === 'win32' && /\.cmd$/i.test(command)) {
    return spawnSync('cmd.exe', ['/d', '/s', '/c', command, ...args], { cwd, encoding: 'utf8', stdio: 'pipe' })
  }
  return spawnSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' })
}

export function verifyGeneratedApp(outDir, opts = {}) {
  if (opts.enabled === false) return { status: 'skipped', reason: 'disabled' }
  if (!existsSync(join(outDir, 'package.json'))) return { status: 'skipped', reason: 'package.json not found' }
  if (opts.install) {
    const installed = runNpm(outDir, ['install'])
    if (installed.status !== 0) return { status: 'failed', command: 'npm install', error: installed.error }
  } else if (!existsSync(join(outDir, 'node_modules'))) {
    return { status: 'skipped', reason: 'node_modules not found; run with --verify-install or run npm install first' }
  }
  const built = runNpm(outDir, ['run', 'build'])
  if (built.status !== 0) return { status: 'failed', command: 'npm run build', error: built.error }
  return { status: 'ok', command: 'npm run build' }
}

export function runNpm(cwd, args) {
  const bin = process.platform === 'win32' ? 'cmd.exe' : 'npm'
  const npmArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm', ...args] : args
  const res = spawnSync(bin, npmArgs, { cwd, encoding: 'utf8', stdio: 'pipe' })
  return {
    status: res.status ?? 1,
    error: (res.error?.message || res.stderr || res.stdout || '').trim().split(/\r?\n/).slice(-4).join(' '),
  }
}

function commandRow(tool, res, detail) {
  if ((res.status ?? 1) !== 0) {
    return {
      tool,
      status: 'failed',
      reason: (res.error?.message || res.stderr || res.stdout || '').trim().split(/\r?\n/).slice(-4).join(' '),
    }
  }
  return { tool, status: 'ok', detail }
}

function localBin(cwd, name) {
  const file = process.platform === 'win32' ? `${name}.cmd` : name
  const p = join(cwd, 'node_modules', '.bin', file)
  return existsSync(p) ? p : null
}

function commandAvailable(command) {
  const probe = spawnSync(command, ['--version'], { encoding: 'utf8', stdio: 'pipe' })
  return (probe.status ?? 1) === 0
}
