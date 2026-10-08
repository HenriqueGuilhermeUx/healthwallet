import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  })
  if (result.error) {
    console.error(result.error)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}

if (process.env.CONTEXT === 'deploy-preview' && process.env.NETLIFY) {
  run('bash', ['scripts/netlify-preview-diagnose.sh'])
  process.exit(0)
}

run('pnpm', ['install', '--prefer-offline'])
rmSync('node_modules/.vite-temp', { recursive: true, force: true })
run('pnpm', ['exec', 'tsc', '-b'])
run('pnpm', ['exec', 'vite', 'build'])
