import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const data = process.env.THREADDECK_DATA_DIR || path.join(homedir(), '.local/share/threaddeck')
const manifest = JSON.parse(await readFile(path.join(data, 'kimaki-fork.json'), 'utf8').catch(() => { throw new Error('Run npm run kimaki:prepare first. The running bot was not changed.') }))
if (manifest.protocol !== 1 || manifest.upstreamVersion !== '1.4.0') throw new Error('Unsupported local Kimaki fork')
const child = spawn(process.execPath, [path.join(root, 'scripts/kimaki.mjs'), ...process.argv.slice(2)], { cwd: root, stdio: 'inherit', env: { ...process.env, THREADDECK_KIMAKI_CLI: manifest.cli } })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('exit', code => { process.exitCode = code ?? 1 })
