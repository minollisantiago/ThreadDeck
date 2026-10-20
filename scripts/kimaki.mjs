import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Separate process groups let shutdown reach npm/tsx grandchildren as well.
export function supervise(commands, { cwd, env = process.env, graceMs = 5_000 } = {}) {
  const children = []
  let stopping = false
  let exitCode = 0
  let killTimer
  function signalChildren(signal) {
    for (const child of children) {
      if (!child.pid) continue
      try { process.kill(-child.pid, signal) }
      catch (error) { if (error.code !== 'ESRCH') console.error(error.message) }
    }
  }
  function stop(code = 0) {
    if (stopping) return
    stopping = true
    exitCode = code
    signalChildren('SIGTERM')
    killTimer = setTimeout(() => signalChildren('SIGKILL'), graceMs)
  }
  const done = Promise.all(commands.map(([command, ...args]) => new Promise(resolve => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit', detached: true })
    children.push(child)
    child.once('error', error => {
      console.error(`Cannot start ${command}: ${error.message}`)
      stop(1)
      resolve()
    })
    child.once('exit', (code, signal) => {
      if (!stopping) stop(code ?? (signal ? 1 : 0))
      resolve()
    })
  }))).then(() => {
    clearTimeout(killTimer)
    return exitCode
  })
  return { done, stop }
}

export async function kimakiStatus(options, run = promisify(execFile)) {
  try {
    const { stdout } = await run('kimaki', ['status', '--json'], { ...options, timeout: 8000 })
    return JSON.parse(stdout)
  } catch (error) {
    // The supported status command exits 1 when the bot is not running.
    if (error.code === 1) {
      try { const status = JSON.parse(error.stdout); if (status.running === false) return status } catch { /* not a valid offline result */ }
    }
    throw error
  }
}

export async function existingServices(port, status) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid PORT')
  let backend = false
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/snapshot`, { signal: AbortSignal.timeout(2000) })
    const snapshot = await response.json().catch(() => null)
    if (!response.ok || !Array.isArray(snapshot?.projects) || typeof snapshot.checkedAt !== 'number'
      || !['connected', 'disconnected', 'stale'].includes(snapshot.health)) {
      throw new Error(`Port ${port} is occupied, but it is not a ThreadDeck dashboard. Nothing was stopped.`)
    }
    backend = true
  } catch (error) {
    if (error.cause?.code !== 'ECONNREFUSED') throw error
  }
  const bot = await status()
  if (typeof bot.running !== 'boolean') throw new Error('Could not determine whether Kimaki is already running. Nothing was stopped.')
  return { backend, kimaki: bot.running }
}

export function launchCommands(args, existing = { backend: false, kimaki: false }) {
  const desktop = args[0] === '--desktop'
  const kimakiArgs = args.slice(desktop ? 1 : 0).filter(arg => arg !== '--reuse-existing')
  return [
    ...(!existing.backend ? [[process.execPath, '--import', 'tsx', 'server/index.ts', '--production']] : []),
    ...(desktop ? [[process.execPath, 'scripts/desktop.mjs']] : []),
    ...(!existing.kimaki ? [['npx', '--yes', 'kimaki@latest', '--gateway', '--if-not-running', ...kimakiArgs]] : []),
  ]
}

async function main() {
  const cwd = fileURLToPath(new URL('..', import.meta.url))
  const env = { ...process.env, PATH: `${path.join(homedir(), '.kimaki', 'bin')}${path.delimiter}${process.env.PATH ?? ''}` }
  const args = process.argv.slice(2)
  const reuse = args[0] === '--desktop' && args.includes('--reuse-existing')
  let active
  let interrupted = false
  const onInterrupt = () => { interrupted = true; active?.stop(130) }
  const onTerminate = () => { interrupted = true; active?.stop(143) }
  process.on('SIGINT', onInterrupt)
  process.on('SIGTERM', onTerminate)
  try {
    const existing = reuse ? await existingServices(Number(env.PORT ?? 43127), () => kimakiStatus({ cwd, env }))
      : { backend: false, kimaki: false }
    if (interrupted) return 130
    if (!existing.backend) {
      console.log('Building ThreadDeck…')
      active = supervise([['npm', 'run', 'build']], { cwd, env })
      const buildCode = await active.done
      if (buildCode !== 0 || interrupted) return buildCode || 130
    } else console.log('Reusing the running ThreadDeck backend; leaving its files and process untouched.')
    if (existing.kimaki) console.log('Reusing running Kimaki; it will not be stopped when this window closes.')
    console.log('Opening ThreadDeck. Closing the window stops only processes started by this launcher.')
    active = supervise(launchCommands(args, existing), { cwd, env })
    return await active.done
  } finally {
    process.off('SIGINT', onInterrupt)
    process.off('SIGTERM', onTerminate)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
