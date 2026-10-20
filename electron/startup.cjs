const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const phases = ['wsl', 'backend', 'kimaki']
const prefix = 'THREADDECK_STARTUP '
const quote = value => `'${value.replaceAll("'", "'\\''")}'`

function serviceArguments(config, lease) {
  if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65535) throw new Error('Invalid startup port')
  for (const value of [config.distro, config.root, config.node, config.nodePath, lease]) {
    if (typeof value !== 'string' || !value || /[\r\n\0]/.test(value)) throw new Error('Invalid startup configuration. Reinstall the Windows launcher.')
  }
  const command = `export PATH=${quote(config.nodePath)} THREADDECK_STARTUP_LEASE=${quote(lease)} PORT=${config.port}; exec ${quote(config.node)} ${quote(`${config.root}/scripts/services.mjs`)}`
  return ['--distribution', config.distro, '--cd', config.root, '--exec', '/bin/sh', '-c', command]
}

function startupController(config, update) {
  let current
  let pendingStop = Promise.resolve()
  function stop() {
    const run = current
    current = null
    if (!run) return pendingStop
    run.stopping = true
    clearInterval(run.heartbeat)
    clearTimeout(run.deadline)
    try { fs.unlinkSync(run.lease) } catch { /* already removed */ }
    pendingStop = (async () => {
      const timeout = setTimeout(() => run.child?.kill(), 8000)
      await run.done
      clearTimeout(timeout)
    })()
    return pendingStop
  }
  async function start() {
    await stop()
    const run = { stopping: false, child: null, heartbeat: null, deadline: null }
    current = run
    try {
      const name = `startup-${randomUUID()}.lease`
      run.lease = path.join(config.windowsDirectory, name)
      fs.writeFileSync(run.lease, '')
      const args = serviceArguments(config, `${config.wslDirectory}/${name}`)
      run.child = spawn('wsl.exe', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      run.heartbeat = setInterval(() => { try { const now = new Date(); fs.utimesSync(run.lease, now, now) } catch { /* shutdown or lease expired */ } }, 1000)
      const log = text => { try { fs.appendFileSync(config.logPath, text) } catch { /* logging must not prevent startup */ } }
      log(`\n[${new Date().toISOString()}] Starting ThreadDeck services\n`)
      let buffer = ''
      run.child.stdout.setEncoding('utf8')
      run.child.stdout.on('data', chunk => {
        const text = chunk.toString(); log(text); buffer += text
        const lines = buffer.split('\n'); buffer = lines.pop().slice(-65536)
        for (const line of lines) if (line.startsWith(prefix)) {
          try {
            const event = JSON.parse(line.slice(prefix.length))
            if (current === run && !run.stopping && phases.includes(event.phase) && ['pending', 'working', 'ready'].includes(event.state)) update(event)
          } catch { /* non-protocol output remains in the log */ }
        }
      })
      run.child.stderr.on('data', chunk => log(chunk.toString()))
      run.done = new Promise(resolve => {
        run.child.once('error', error => { clearInterval(run.heartbeat); clearTimeout(run.deadline); log(`${error.message}\n`); if (!run.stopping) update({ error: `Could not start WSL: ${error.message}` }); resolve() })
        run.child.once('exit', code => {
          clearInterval(run.heartbeat); clearTimeout(run.deadline)
          if (!run.stopping) update({ error: `The WSL launcher stopped (${code ?? 'interrupted'}). Open the startup log for details.` })
          resolve()
        })
      })
      run.deadline = setTimeout(() => { if (!run.stopping) { update({ error: 'Startup is taking longer than expected. You can retry or open the startup log.' }); void stop() } }, 180_000)
    } catch (error) {
      run.done ??= Promise.resolve()
      update({ error: error.message })
      await stop()
    }
  }
  return { start, stop, ready: () => clearTimeout(current?.deadline) }
}

module.exports = { serviceArguments, startupController, prefix }
