import { spawn } from 'node:child_process'
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

export function launchCommands(args) {
  const desktop = args[0] === '--desktop'
  return [
    [process.execPath, '--import', 'tsx', 'server/index.ts', '--production'],
    ...(desktop ? [[process.execPath, 'scripts/desktop.mjs']] : []),
    ['npx', '--yes', 'kimaki@latest', '--gateway', '--if-not-running', ...args.slice(desktop ? 1 : 0)],
  ]
}

async function main() {
  const cwd = fileURLToPath(new URL('..', import.meta.url))
  const env = { ...process.env, PATH: `${path.join(homedir(), '.kimaki', 'bin')}${path.delimiter}${process.env.PATH ?? ''}` }
  let active
  let interrupted = false
  const onInterrupt = () => { interrupted = true; active?.stop(130) }
  const onTerminate = () => { interrupted = true; active?.stop(143) }
  process.on('SIGINT', onInterrupt)
  process.on('SIGTERM', onTerminate)
  try {
    console.log('Building ThreadDeck…')
    active = supervise([['npm', 'run', 'build']], { cwd, env })
    const buildCode = await active.done
    if (buildCode !== 0 || interrupted) return buildCode || 130
    console.log('Starting ThreadDeck and Kimaki. Ctrl+C stops both.')
    active = supervise(launchCommands(process.argv.slice(2)), { cwd, env })
    return await active.done
  } finally {
    process.off('SIGINT', onInterrupt)
    process.off('SIGTERM', onTerminate)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main()
}
