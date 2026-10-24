// Prepare a pinned downstream installation. Never edits or starts the running bot.
import { mkdir, readFile, writeFile, cp, symlink, access } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('..', import.meta.url))
const data = process.env.THREADDECK_DATA_DIR || path.join(homedir(), '.local/share/threaddeck')
const base = path.join(data, 'kimaki', 'base'), version = '1.4.0'
await mkdir(base, { recursive: true, mode: 0o700 })
try { await access(path.join(base, 'node_modules/kimaki/package.json')) }
catch {
  console.log(`Installing isolated Kimaki ${version} baseline (no bot is started)…`)
  await promisify(execFile)('npm', ['install', '--prefix', base, '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', `kimaki@${version}`], { timeout: 600_000, maxBuffer: 8 * 1024 * 1024 })
}
const original = path.join(base, 'node_modules/kimaki')
if (JSON.parse(await readFile(path.join(original, 'package.json'), 'utf8')).version !== version) throw new Error('Unexpected baseline version; refusing to patch')
const core = await build({ entryPoints: [path.join(root, 'integrations/kimaki/bridge-core.ts')], bundle: true, platform: 'node', format: 'esm', target: 'node24', packages: 'external', write: false })
const adapter = await readFile(path.join(root, 'integrations/kimaki/adapter.mjs'), 'utf8')
const hash = createHash('sha256').update(core.outputFiles[0].contents).update(adapter).update(await readFile(fileURLToPath(import.meta.url))).digest('hex').slice(0, 16)
const fork = path.join(data, 'kimaki', `fork-${version}-${hash}`)
let exists = false
try { await access(path.join(fork, '.prepared')); exists = true } catch { /* new build */ }
if (!exists) {
  await mkdir(fork, { recursive: true, mode: 0o700 })
  await cp(original, fork, { recursive: true, filter: filename => !path.relative(original, filename).split(path.sep).includes('node_modules') })
  // Dependencies belong to this isolated baseline, not an npx cache or live install.
  try { await symlink(path.join(base, 'node_modules'), path.join(fork, 'node_modules'), 'dir') } catch (error) { if (error.code !== 'EEXIST') throw error }
  for (const [directory, extension] of [['dist', 'js'], ['src', 'ts']]) {
    const main = path.join(fork, directory, `main.${extension}`)
    let text = await readFile(main, 'utf8')
    const anchor = "lock.handle((route, input, signal) => runLockRoute(bot, { route: route.slice('/kimaki/'.length), input, signal }))"
    if (text.split(anchor).length !== 2) throw new Error('Kimaki main wiring changed; manual review required')
    text = `import { attachThreadDeckBridge } from './threaddeck-adapter.js'\n${text}`
      .replace(anchor, `const threaddeck = attachThreadDeckBridge(bot);\n    cleanup.defer(() => threaddeck.stop());\n    lock.handle((route, input, signal) => route.startsWith('/kimaki/client.')\n      ? threaddeck.handle(route.slice('/kimaki/client.'.length), input, signal)\n      : runLockRoute(bot, { route: route.slice('/kimaki/'.length), input, signal }))`)
    await writeFile(main, text)
    const catalog = path.join(fork, directory, `slash-commands.${extension}`)
    const source = await readFile(catalog, 'utf8')
    if (source.split('async function readCatalog(').length !== 2) throw new Error('Kimaki catalog seam changed; manual review required')
    await writeFile(catalog, source.replace('async function readCatalog(', 'export async function readCatalog('))
    const sessions = path.join(fork, directory, `sessions.${extension}`)
    let setup = await readFile(sessions, 'utf8')
    if (setup.split('run = true,').length !== 2 || setup.split('if (!run) {').length !== 2) throw new Error('Kimaki session setup seam changed; manual review required')
    setup = setup.replace('run = true,', 'run = true, threaddeckSetup = false,')
      .replace('if (!run) {', 'if (!run) {\n      if (threaddeckSetup) return { threadId: thread.id, sessionId: session.id };')
    if (extension === 'ts') setup = setup.replace('run?: boolean', 'run?: boolean\n    threaddeckSetup?: boolean')
    await writeFile(sessions, setup)
    await writeFile(path.join(fork, directory, 'threaddeck-adapter.js'), adapter)
    await writeFile(path.join(fork, directory, 'threaddeck-core.js'), core.outputFiles[0].contents)
  }
  await writeFile(path.join(fork, '.prepared'), hash)
}
await promisify(execFile)(process.execPath, ['--check', path.join(fork, 'dist/main.js')], { timeout: 30_000 })
await promisify(execFile)(process.execPath, [path.join(fork, 'dist/cli.js'), '--help'], { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 })
const manifest = { upstreamVersion: version, protocol: 1, cli: path.join(fork, 'dist/cli.js'), hash }
await writeFile(path.join(data, 'kimaki-fork.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 })
console.log(`Local fork prepared: ${manifest.cli}\nRunning Kimaki was NOT changed or restarted. Launchers prefer this fork when starting a missing bot; existing bots are reused. Stop the current bot yourself only when deliberately switching versions.`)
