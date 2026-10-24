// Startup-only fork retries. Never evict a bot, replay prompts, or adopt ownership
// of a process discovered on the lock port. The parent still owns OpenCode/backend.
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { access, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

export async function preparedFork(env = process.env) {
  const root = env.THREADDECK_DATA_DIR || path.join(homedir(), '.local/share/threaddeck')
  try {
    const manifest = JSON.parse(await readFile(path.join(root, 'kimaki-fork.json'), 'utf8'))
    if (manifest.protocol !== 1 || manifest.upstreamVersion !== '1.4.0' || !path.isAbsolute(manifest.cli)) return null
    // Explicit local launchers can select the same prepared binary, but may not
    // accidentally replace an unprepared path with an arbitrary executable.
    const cli = env.THREADDECK_KIMAKI_CLI || manifest.cli
    if (!path.isAbsolute(cli)) return null
    await access(cli)
    return cli
  } catch { return null }
}

export async function probeKimaki(env = process.env, signal) {
  const port = Number(env.KIMAKI_LOCK_PORT || 29988)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid Kimaki lock port')
  const options = { signal: AbortSignal.any([AbortSignal.timeout(1200), ...(signal ? [signal] : [])]) }
  let health
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, options)
    health = await response.json()
    if (!response.ok || health.status !== 'ok' || !Number.isInteger(health.pid)) throw new Error('The Kimaki port is occupied by an unrecognized service. Nothing was stopped.')
  } catch (error) {
    if (error.cause?.code === 'ECONNREFUSED') return { running: false }
    throw error // A timeout or malformed response is not evidence the port is free.
  }
  const state = { running: true, ready: false, mode: 'regular', pid: health.pid }
  try {
    const token = (await readFile(path.join(env.KIMAKI_DATA_DIR || path.join(homedir(), '.kimaki'), 'lock-token'), 'utf8')).trim()
    if (!/^[a-f0-9]{64}$/.test(token)) return state
    const rpc = async route => {
      const response = await fetch(`http://127.0.0.1:${port}/kimaki/${route}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}',
        signal: AbortSignal.any([AbortSignal.timeout(1200), ...(signal ? [signal] : [])]),
      })
      return response.ok ? response.json() : null
    }
    const status = await rpc('status')
    state.ready = Boolean(status?.pid === health.pid && status.opencode?.connected && Array.isArray(status.guilds) && status.guilds.length)
    const info = await rpc('client.info')
    if (info?.ok && info.value?.protocol === 1 && ['history', 'changes', 'prompt', 'queue', 'files', 'catalog', 'abort'].every(capability => info.value.capabilities?.includes(capability))) {
      state.mode = 'fork'
      if (info.value.ready === false) state.ready = false
    }
    return state
  } catch { return state } // Bound but not authenticated/ready: never evict it.
}

function groupAlive(pid) {
  try { process.kill(-pid, 0); return true } catch (error) { if (error.code === 'ESRCH') return false; throw error }
}
export async function processGroup(pid, { platform = process.platform, read = readFile, run = promisify(execFile) } = {}) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null
  try {
    let group
    if (platform === 'linux') {
      const stat = await read(`/proc/${pid}/stat`, 'utf8')
      group = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[2])
    } else group = Number((await run('ps', ['-o', 'pgid=', '-p', String(pid)], { timeout: 1000 })).stdout.trim())
    return Number.isSafeInteger(group) && group > 0 ? group : null
  } catch { return null }
}
export function spawnKimaki(command, { cwd, env = process.env, graceMs = 2500 } = {}) {
  const [binary, ...args] = command
  const child = spawn(binary, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  let output = '', stopped
  const capture = (stream, destination) => stream.on('data', chunk => { destination.write(chunk); output = `${output}${chunk}`.slice(-16384) })
  capture(child.stdout, process.stdout); capture(child.stderr, process.stderr)
  let result
  const done = new Promise(resolve => {
    child.once('error', error => { result = { code: 1, error }; resolve(result) })
    child.once('exit', (code, signal) => { result = { code: code ?? (signal ? 1 : 0) }; resolve(result) })
  })
  function stop() {
    return stopped ??= (async () => {
      if (!child.pid) return
      const send = signal => { try { process.kill(-child.pid, signal) } catch (error) { if (error.code !== 'ESRCH') throw error } }
      send('SIGTERM')
      const deadline = Date.now() + graceMs
      while (groupAlive(child.pid) && Date.now() < deadline) await delay(50)
      if (groupAlive(child.pid)) send('SIGKILL')
      await done
      // Do not start another bot if an owned descendant still occupies the port.
    })()
  }
  return { done, stop, get result() { return result }, get permanentFailure() {
    return /invalid (?:bot )?token|tokeninvalid|authentication failed|unauthorized|no bot configured|no (?:saved )?credentials|invalid .*config|configuration error/i.test(output)
  }, async owns(pid) { return await processGroup(pid) === child.pid } }
}

export async function startPreferredKimaki({ cwd, env = process.env, args = [], signal = new AbortController().signal,
  progress = () => {}, probe = probeKimaki, prepare = preparedFork, launch = spawnKimaki,
  wait = (ms, signal) => delay(ms, undefined, { signal }), now = Date.now, startupMs = 20_000, regularStartupMs = 30_000,
} = {}) {
  signal.throwIfAborted()
  const report = (state, detail, mode) => progress({ phase: 'kimaki', state, detail, ...(mode && { mode }) })
  const reused = state => {
    report('ready', state.mode === 'fork' ? 'Connected to running Kimaki fork' : 'Running regular Kimaki—desktop chat unavailable (reused)', state.mode)
    let finish
    const done = new Promise(resolve => { finish = resolve })
    return { mode: state.mode, reused: true, done, stop: async () => finish({ code: 0 }) }
  }
  async function waitForExisting(initial) {
    let state = initial
    const deadline = now() + startupMs
    while (!state.ready) {
      signal.throwIfAborted()
      if (now() >= deadline) throw new Error('An existing Kimaki is not ready. It was left untouched; check its startup log before retrying.')
      await wait(250, signal)
      state = await probe(env, signal)
      if (!state.running) return null
    }
    return reused(state)
  }
  const existing = await probe(env, signal)
  if (existing.running) {
    const running = await waitForExisting(existing)
    if (running) return running
  }
  const cli = await prepare(env)
  signal.throwIfAborted()
  if (!cli) report('working', 'Prepared fork unavailable; starting regular Kimaki—desktop chat unavailable', 'regular')
  const candidates = [...(cli ? Array.from({ length: 3 }, (_, i) => ({ mode: 'fork', attempt: i + 1, command: [process.execPath, cli] })) : []),
    { mode: 'regular', attempt: 1, command: ['npx', '--yes', 'kimaki@latest'] }]
  for (let index = 0; index < candidates.length; index++) {
    signal.throwIfAborted()
    // A concurrent launcher can win during cleanup/backoff. Always reuse it.
    const current = await probe(env, signal)
    if (current.running) { const running = await waitForExisting(current); if (running) return running }
    const candidate = candidates[index]
    report('working', candidate.mode === 'fork' ? `Starting Kimaki fork (attempt ${candidate.attempt}/3)` : 'Starting regular Kimaki—desktop chat unavailable', candidate.mode)
    const owned = launch([...candidate.command, '--gateway', '--if-not-running', ...args], { cwd, env })
    const onAbort = () => { void owned.stop().catch(() => {}) }
    signal.addEventListener('abort', onAbort, { once: true })
    let activated = false
    try {
      signal.throwIfAborted()
      const deadline = now() + (candidate.mode === 'fork' ? startupMs : regularStartupMs)
      do {
        signal.throwIfAborted()
        const state = await probe(env, signal)
        if (state.running && !await owned.owns(state.pid)) {
          // --if-not-running never evicts a race winner, and neither do we.
          await owned.stop()
          const concurrent = await probe(env, signal)
          if (concurrent.running) { const running = await waitForExisting(concurrent); if (running) return running }
          break
        }
        if (state.ready && (state.mode === candidate.mode || candidate.mode === 'regular') && !owned.result) {
          activated = true
          report('ready', state.mode === 'fork' ? 'Kimaki fork and desktop chat bridge are ready' : 'Running regular Kimaki—desktop chat unavailable', state.mode)
          return { mode: state.mode, reused: false, done: owned.done, stop: owned.stop }
        }
        if (owned.result) break
        await wait(250, signal)
      } while (now() < deadline)
    } catch (error) {
      signal.throwIfAborted()
      report('working', `${candidate.mode === 'fork' ? 'Kimaki fork' : 'Regular Kimaki'} readiness check failed; cleaning up the owned process`)
    } finally {
      signal.removeEventListener('abort', onAbort)
      if (!activated) await owned.stop()
    }
    signal.throwIfAborted()
    // Exhausted/failed owned process must release the lock before any new spawn.
    const after = await probe(env, signal)
    if (after.running) {
      if (await owned.owns(after.pid)) throw new Error('An owned Kimaki did not release its lock after shutdown. Refusing to start a second bot.')
      const running = await waitForExisting(after)
      if (running) return running
    }
    if (candidate.mode === 'regular') throw new Error('Regular Kimaki also failed to become ready. Check the startup log; no further bots were launched.')
    if (owned.permanentFailure) {
      report('working', 'Fork authentication/configuration failed; skipping repeated attempts and trying regular Kimaki once', 'regular')
      index = candidates.length - 2
    } else if (candidate.attempt < 3) {
      report('working', `Kimaki fork attempt ${candidate.attempt}/3 failed; retrying shortly`, 'fork')
      await wait(candidate.attempt * 1000, signal)
    }
  }
  throw new Error('Kimaki did not start')
}

async function main() {
  const controller = new AbortController()
  let running
  const stop = () => { controller.abort(); void running?.stop().catch(() => {}) }
  process.on('SIGINT', stop); process.on('SIGTERM', stop)
  try {
    running = await startPreferredKimaki({ env: process.env, cwd: fileURLToPath(new URL('..', import.meta.url)), args: process.argv.slice(2), signal: controller.signal,
      progress: event => console.log(`THREADDECK_STARTUP ${JSON.stringify(event)}`) })
    if (controller.signal.aborted) await running.stop()
    return (await running.done).code
  } finally {
    await running?.stop()
    process.off('SIGINT', stop); process.off('SIGTERM', stop)
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main() } catch (error) { if (error.name !== 'AbortError') { console.error(error.message); process.exitCode = 1 } }
}
