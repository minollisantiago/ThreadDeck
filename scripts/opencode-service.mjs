import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { homedir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Service } from '@opencode/client/service'

export async function openCodeCommand(env, run = promisify(execFile)) {
  const candidates = env.OPENCODE_PATH ? [env.OPENCODE_PATH]
    : ['opencode', path.join(homedir(), '.opencode', 'bin', 'opencode'), 'opencode2']
  for (const binary of candidates) {
    try {
      const { stdout } = await run(binary, ['--version'], { env, timeout: 10_000 })
      if (/\bv?(?:2\.\d+\.\d+|0\.0\.0-dev[^\s]*)/.test(stdout)) return [binary, 'serve', '--service', '--hostname', '127.0.0.1']
    } catch { /* try the next installed V2 binary */ }
  }
  throw new Error('OpenCode V2 was not found. Set OPENCODE_PATH to its executable.')
}

// Hold the actual child handle: a later replacement or a concurrently started
// service is never adopted, even if it occupies the same registration file.
export class OpenCodeService {
  constructor({ cwd, env = process.env, discover = Service.discover, command = openCodeCommand,
    startupMs = 30_000, graceMs = 5_000 } = {}) {
    Object.assign(this, { cwd, env, discover, command, startupMs, graceMs })
    this.child = null
    this.exited = null
    this.stopping = null
  }

  async start(signal) {
    signal?.throwIfAborted()
    const file = this.env.KIMAKI_OPENCODE_SERVICE_FILE
    const existing = await this.discover({ file })
    signal?.throwIfAborted()
    if (existing) return 'reused'
    // Custom registrations describe externally managed services. The CLI's
    // --service command publishes to its normal XDG registration, not this file.
    if (file) throw new Error('The configured OpenCode service is unavailable. Its custom registration is left untouched.')
    const [binary, ...args] = await this.command(this.env)
    signal?.throwIfAborted()
    this.child = spawn(binary, args, { cwd: this.cwd, env: this.env, stdio: 'inherit', detached: true })
    const child = this.child
    let failure
    this.exited = new Promise(resolve => {
      child.once('error', error => { failure = error; resolve() })
      child.once('exit', () => resolve())
    })
    try {
      const deadline = Date.now() + this.startupMs
      do {
        signal?.throwIfAborted()
        if (failure) throw failure
        if (child.exitCode !== null && child.exitCode !== 0 || child.signalCode) throw new Error('OpenCode exited before it was ready')
        if (await this.discover({ file })) return child.exitCode === null ? 'started' : 'reused'
        await delay(100, undefined, { signal })
      } while (Date.now() < deadline)
      throw new Error('Timed out waiting for OpenCode to start')
    } catch (error) { await this.stop(); throw error }
  }

  stop() {
    if (this.stopping) return this.stopping
    this.stopping = (async () => {
      const child = this.child
      if (!child || child.exitCode !== null || child.signalCode) return
      // Never use a global service-stop command or kill by name/registration.
      child.kill('SIGTERM')
      const timer = setTimeout(() => { if (child.exitCode === null && !child.signalCode) child.kill('SIGKILL') }, this.graceMs)
      try { await this.exited } finally { clearTimeout(timer) }
    })()
    return this.stopping
  }
}
