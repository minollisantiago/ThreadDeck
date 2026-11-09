// Prepare a pinned downstream installation. Never edits or starts the running bot.
import { mkdir, readFile, writeFile, cp, symlink, access, readdir } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import ffmpegPath from 'ffmpeg-static'

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
const audio = await readFile(path.join(root, 'integrations/kimaki/audio-prompt.mjs'), 'utf8')
const schedules = await readFile(path.join(root, 'integrations/kimaki/schedules.mjs'), 'utf8')
const require = createRequire(import.meta.url)
const ffmpegPackage = path.dirname(require.resolve('ffmpeg-static/package.json'))
const ffmpegVersion = JSON.parse(await readFile(path.join(ffmpegPackage, 'package.json'), 'utf8')).version
if (!ffmpegPath) throw new Error('ffmpeg-static does not support this platform')
try { await promisify(execFile)(ffmpegPath, ['-version'], { timeout: 10_000 }) }
catch { throw new Error('Packaged FFmpeg is unavailable. Run npm install with the approved ffmpeg-static install script enabled, then prepare again.') }
const hash = createHash('sha256').update(core.outputFiles[0].contents).update(adapter).update(audio).update(schedules).update(ffmpegVersion).update(ffmpegPath).update(await readFile(fileURLToPath(import.meta.url))).digest('hex').slice(0, 16)
const fork = path.join(data, 'kimaki', `fork-${version}-${hash}`)
let exists = false
try { await access(path.join(fork, '.prepared')); exists = true } catch { /* new build */ }
if (!exists) {
  await mkdir(fork, { recursive: true, mode: 0o700 })
  await cp(original, fork, { recursive: true, filter: filename => !path.relative(original, filename).split(path.sep).includes('node_modules') })
  // Overlay dependencies without mutating the shared baseline or older forks.
  // prism-media is tiny and must resolve from THIS fork so its own M4A converter
  // discovers ffmpeg-static. Symlinking prism would resolve against the baseline.
  const dependencies = path.join(fork, 'node_modules')
  await mkdir(dependencies, { recursive: true })
  for (const name of await readdir(path.join(base, 'node_modules'))) {
    if (name === '.bin' || name === '.package-lock.json' || name === 'ffmpeg-static') continue
    const source = path.join(base, 'node_modules', name), destination = path.join(dependencies, name)
    if (name === 'prism-media') await cp(source, destination, { recursive: true })
    else try { await symlink(source, destination, 'dir') } catch (error) { if (error.code !== 'EEXIST') throw error }
  }
  // Share the one installed platform binary; do not copy another ~76 MiB per fork.
  try { await symlink(ffmpegPackage, path.join(dependencies, 'ffmpeg-static'), 'dir') } catch (error) { if (error.code !== 'EEXIST') throw error }
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
    // Kimaki 1.4.0 supplies pipe:1 twice: once here and once inside prism.FFmpeg.
    // With a real executable this creates an invalid second output and no PCM.
    const voice = path.join(fork, directory, `voice.${extension}`)
    const voiceSource = await readFile(voice, 'utf8')
    const m4aOutput = "args: [...args, '-f', 's16le', '-acodec', 'pcm_s16le', '-ac', '1', '-ar', '48000', 'pipe:1']"
    if (voiceSource.split(m4aOutput).length !== 2) throw new Error('Kimaki M4A conversion seam changed; manual review required')
    await writeFile(voice, voiceSource.replace(m4aOutput, "args: [...args, '-f', 's16le', '-acodec', 'pcm_s16le', '-ac', '1', '-ar', '48000']"))
    await writeFile(path.join(fork, directory, 'threaddeck-adapter.js'), adapter)
    await writeFile(path.join(fork, directory, 'threaddeck-audio.js'), audio)
    // Extend the canonical writer with a revision guard, then use a compare-and-
    // swap at its existing update. This also prevents native CLI lost updates.
    const scheduler = path.join(fork, directory, `scheduler.${extension}`)
    let scheduling = await readFile(scheduler, 'utf8')
    const signature = extension === 'ts' ? 'export async function editTask(bot: Bot, edit: TaskEdit)' : 'export async function editTask(bot, edit)'
    const guarded = extension === 'ts' ? 'export async function editTask(bot: Bot, edit: TaskEdit, guard: (row: TaskRow) => boolean = () => true)' : 'export async function editTask(bot, edit, guard = () => true)'
    const editWhere = '.where(orm.and(orm.eq(schema.scheduled_tasks.id, edit.id), orm.eq(schema.scheduled_tasks.status, \'planned\')))'
    if (scheduling.split(signature).length !== 2 || scheduling.split(editWhere).length !== 2) throw new Error('Kimaki schedule edit seam changed; manual review required')
    scheduling = scheduling.replace(signature, guarded)
      .replace('const job = decodeTaskPayload(row.payload_json)\n  if (job instanceof Error) return job\n  const user = edit.user', "if (!guard(row)) return new ConfigError({ reason: 'Schedule changed; refresh before editing again' })\n  const job = decodeTaskPayload(row.payload_json)\n  if (job instanceof Error) return job\n  const user = edit.user")
      .replace(editWhere, `.where(orm.and(orm.eq(schema.scheduled_tasks.id, edit.id), orm.eq(schema.scheduled_tasks.status, 'planned'), orm.eq(schema.scheduled_tasks.payload_json, row.payload_json), orm.eq(schema.scheduled_tasks.next_run_at, row.next_run_at), orm.eq(schema.scheduled_tasks.schedule_kind, row.schedule_kind), row.cron_expr === null ? orm.isNull(schema.scheduled_tasks.cron_expr) : orm.eq(schema.scheduled_tasks.cron_expr, row.cron_expr), row.timezone === null ? orm.isNull(schema.scheduled_tasks.timezone) : orm.eq(schema.scheduled_tasks.timezone, row.timezone)))`)
    // Built JavaScript has semicolons; inject the same guard at its own anchor.
    if (extension === 'js') {
      const anchor = 'const user = edit.user === undefined'
      if (scheduling.split(anchor).length !== 2) throw new Error('Kimaki schedule revision seam changed')
      scheduling = scheduling.replace(anchor, "if (!guard(row)) return new ConfigError({ reason: 'Schedule changed; refresh before editing again' });\n    const user = edit.user === undefined")
    } else if (!scheduling.includes('if (!guard(row))')) throw new Error('Kimaki schedule revision seam changed')
    // Guard confirmations too: do not dispatch/delete an intervening edit. The
    // native cron loop keeps its due-time claim; only guarded desktop run-now
    // calls supply an expected row to that same canonical atomic claim.
    const fields = name => ['payload_json', 'next_run_at', 'schedule_kind', 'cron_expr', 'timezone', 'status'].map(field => `(${name}.${field} === null ? orm.isNull(schema.scheduled_tasks.${field}) : orm.eq(schema.scheduled_tasks.${field}, ${name}.${field}))`).join(', ')
    const runSignature = extension === 'ts' ? 'async function runTask(bot: Bot, { id, dueAt }: { id: number; dueAt: Date | null })' : 'async function runTask(bot, { id, dueAt })'
    const runGuarded = extension === 'ts' ? 'async function runTask(bot: Bot, { id, dueAt, expected }: { id: number; dueAt: Date | null; expected?: TaskRow })' : 'async function runTask(bot, { id, dueAt, expected })'
    const nowSignature = extension === 'ts' ? 'export async function runTaskNow(bot: Bot, id: number)' : 'export async function runTaskNow(bot, id)'
    const deleteSignature = extension === 'ts' ? 'export async function deleteTask(bot: Bot, id: number)' : 'export async function deleteTask(bot, id)'
    const guardType = extension === 'ts' ? ', guard?: (row: TaskRow) => boolean)' : ', guard)'
    const due = '...(dueAt ? [orm.eq(schema.scheduled_tasks.next_run_at, dueAt)'
    const runCall = 'const outcome = await runTask(bot, { id, dueAt: null })'
    for (const anchor of [runSignature, nowSignature, deleteSignature, due, runCall]) if (scheduling.split(anchor).length !== 2) throw new Error('Kimaki schedule confirmation seam changed')
    scheduling = scheduling.replace(runSignature, runGuarded)
      .replace(nowSignature, nowSignature.slice(0, -1) + guardType)
      .replace(deleteSignature, deleteSignature.slice(0, -1) + guardType)
      .replace(due, `...(expected ? [${fields('expected')}] : []),\n      ${due}`)
      .replace(runCall, "if (guard && !guard(row)) return new ConfigError({ reason: 'Schedule changed; refresh before running again' });\n  const outcome = await runTask(bot, { id, dueAt: null, ...(guard && { expected: row }) })")
    const deleteStart = 'const removed = await bot.db.delete(schema.scheduled_tasks).where(orm.eq(schema.scheduled_tasks.id, id))'
    if (scheduling.split(deleteStart).length !== 2) throw new Error('Kimaki schedule delete seam changed')
    scheduling = scheduling.replace(deleteStart, `const expected = guard ? await bot.db.query.scheduled_tasks.findFirst({ where: { id } }) : null;\n  if (guard && (!expected || !guard(expected))) return new ConfigError({ reason: 'Schedule changed; refresh before deleting again' });\n  const removed = await bot.db.delete(schema.scheduled_tasks).where(orm.and(orm.eq(schema.scheduled_tasks.id, id), ...(expected ? [${fields('expected')}] : [])))`)
    await writeFile(scheduler, scheduling)
    await writeFile(path.join(fork, directory, 'threaddeck-schedules.js'), schedules)
    await writeFile(path.join(fork, directory, 'threaddeck-core.js'), core.outputFiles[0].contents)
  }
  await writeFile(path.join(fork, '.prepared'), hash)
}
await promisify(execFile)(process.execPath, ['--check', path.join(fork, 'dist/main.js')], { timeout: 30_000 })
await promisify(execFile)(process.execPath, [path.join(fork, 'dist/cli.js'), '--help'], { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 })
const manifest = { upstreamVersion: version, protocol: 1, cli: path.join(fork, 'dist/cli.js'), hash }
await writeFile(path.join(data, 'kimaki-fork.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 })
console.log(`Local fork prepared: ${manifest.cli}\nRunning Kimaki was NOT changed or restarted. Launchers prefer this fork when starting a missing bot; existing bots are reused. Stop the current bot yourself only when deliberately switching versions.`)
