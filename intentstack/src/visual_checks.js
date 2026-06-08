export function responsiveVisualChecks(files, target) {
  const findings = []
  const componentFiles = Object.entries(files).filter(([path]) =>
    !path.endsWith('/AppNav.tsx') && (target === 'next_shadcn'
      ? path.startsWith('components/generated/') && path.endsWith('.tsx')
      : path.startsWith('src/generated/components/') && path.endsWith('.tsx')))
  for (const [path, source] of componentFiles) {
    if (/<section|<header|<footer/.test(source) && !/data-intent-section-type=/.test(source)) {
      findings.push({ code: 'VIS001', path, message: 'section telemetry hook missing' })
    }
  }
  const joined = componentFiles.map(([, source]) => source).join('\n')
  if (!/(^|[\s"'])(sm:|md:|lg:|xl:|max-w-|grid-cols-|overflow-x-auto)/.test(joined)) {
    findings.push({ code: 'VIS002', path: '(components)', message: 'responsive layout classes missing' })
  }
  return findings
}
