import { statSync } from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { existingServices, kimakiStatus, launchCommands, supervise } from './kimaki.mjs'
import { OpenCodeService } from './opencode-service.mjs'

const cwd = fileURLToPath(new URL('..', import.meta.url))
const env = { ...process.env, PATH: `${path.join(homedir(), '.kimaki', 'bin')}:${process.env.PATH ?? ''}` }
const lease = env.THREADDECK_STARTUP_LEASE
if (!lease) throw new Error('The Windows client must supply a startup lease')
const port = Number(env.PORT ?? 43127)
const progress = (phase, state, detail) => console.log(`THREADDECK_STARTUP ${JSON.stringify({ phase, state, detail })}`)
let active
let opencode
const startup = new AbortController()
let stopped = false
let finishIdle
const stop = () => { stopped = true; startup.abort(); active?.stop(0); finishIdle?.(0) }
const checkLease = () => {
  try { if (Date.now() - statSync(lease).mtimeMs < 10_000) return } catch { /* client closed */ }
  stop()
}
const watchdog = setInterval(checkLease, 500)
checkLease()
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

try {
  progress('wsl', 'ready', 'Windows Subsystem for Linux is ready')
  progress('backend', 'working', 'Checking for an existing dashboard')
  progress('kimaki', 'working', 'Checking for running Kimaki')
  const existing = await existingServices(port, () => kimakiStatus({ cwd, env }))
  if (!stopped && !existing.backend) {
    progress('backend', 'working', 'Building your dashboard')
    active = supervise([['npm', 'run', 'build']], { cwd, env })
    const code = await active.done
    if (code !== 0 && !stopped) throw new Error(`Dashboard build failed (${code})`)
  }
  if (!stopped && !existing.kimaki) {
    progress('kimaki', 'working', 'Checking OpenCode before starting Kimaki')
    opencode = new OpenCodeService({ cwd, env })
    const ownership = await opencode.start(startup.signal)
    console.log(ownership === 'started' ? 'Started OpenCode; it will stop after owned Kimaki exits.' : 'Reusing running OpenCode; it will be left running.')
  }
  if (!stopped) {
    progress('backend', existing.backend ? 'ready' : 'working', existing.backend ? 'Connected to the running dashboard' : 'Starting the dashboard backend')
    // New bots report readiness only after both Kimaki and the bridge are checked
    // by the fork-first launcher. A running external bot is never replaced.
    progress('kimaki', 'working', existing.kimaki ? 'Checking running Kimaki' : 'Starting Kimaki fork')
    // Always run the bot startup wrapper, even for reuse: it verifies readiness,
    // reports the actual bot mode, and owns no external bot's lifetime.
    const commands = launchCommands(['--reuse-existing'], { ...existing, kimaki: false })
    active = commands.length ? supervise(commands, { cwd, env }) : null
    let checking = false
    const check = async () => {
      if (checking || stopped) return
      checking = true
      try {
        if (!existing.backend) {
          try {
            const response = await fetch(`http://127.0.0.1:${port}/api/snapshot`, { signal: AbortSignal.timeout(1500) })
            if (response.ok) { existing.backend = true; progress('backend', 'ready', 'Dashboard backend is ready') }
          } catch { /* still starting */ }
        }
        // Bot readiness/mode comes exclusively from the fork-first wrapper.
      } finally { checking = false }
    }
    const poll = setInterval(() => { void check() }, 1500)
    try {
      void check()
      process.exitCode = active ? await active.done : await new Promise(resolve => { finishIdle = resolve; if (stopped) resolve(0) })
    } finally { clearInterval(poll) }
  }
} catch (error) {
  if (!stopped) { console.error(error.message); process.exitCode = 1 }
  active?.stop(stopped ? 0 : 1)
  await active?.done
}
finally {
  clearInterval(watchdog)
  active?.stop()
  await active?.done
  await opencode?.stop()
  process.off('SIGINT', stop); process.off('SIGTERM', stop)
}
