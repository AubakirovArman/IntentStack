export const DEPLOY_PLATFORMS = ['vercel', 'netlify', 'render']

export function deploymentPlan(graph, platform) {
  if (!DEPLOY_PLATFORMS.includes(platform)) {
    throw new Error(`Unknown deploy platform "${platform}". Available: ${DEPLOY_PLATFORMS.join(', ')}`)
  }
  if (platform === 'vercel') return vercelPlan(graph)
  if (platform === 'netlify') return netlifyPlan(graph)
  return renderPlan(graph)
}

function vercelPlan(graph) {
  const next = graph.project?.target === 'next_shadcn'
  const config = {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    buildCommand: 'npm run build',
  }
  if (next) config.framework = 'nextjs'
  else config.outputDirectory = 'dist'
  return {
    platform: 'vercel',
    command: 'npx vercel --prod',
    files: { 'vercel.json': JSON.stringify(config, null, 2) + '\n' },
    warnings: next ? [] : ['web_ts_minimal deploys its Vite frontend to Vercel; the Hono API needs a separate Node host.'],
  }
}

function netlifyPlan(graph) {
  const next = graph.project?.target === 'next_shadcn'
  return {
    platform: 'netlify',
    command: next ? 'npx netlify deploy --prod' : 'npx netlify deploy --prod --dir dist',
    files: {
      'netlify.toml': next ? `[build]
command = "npm run build"

[[plugins]]
package = "@netlify/plugin-nextjs"
` : `[build]
command = "npm run build"
publish = "dist"
`,
    },
    warnings: next ? ['Install @netlify/plugin-nextjs if your Netlify account does not auto-install it.'] : ['web_ts_minimal deploys its Vite frontend to Netlify; the Hono API needs a separate Node host.'],
  }
}

function renderPlan(graph) {
  const id = (graph.project?.id || 'intentstack-app').toLowerCase().replace(/[^a-z0-9-]+/g, '-') || 'intentstack-app'
  const next = graph.project?.target === 'next_shadcn'
  return {
    platform: 'render',
    command: 'git push origin main',
    files: {
      'render.yaml': `services:
  - type: web
    name: ${id}
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm run start
`,
    },
    warnings: next ? ['Render deploys from Git using render.yaml; connect this repository in Render first.'] : ['web_ts_minimal starts the Hono API on Render; serve the Vite dist separately or add static serving.'],
  }
}
