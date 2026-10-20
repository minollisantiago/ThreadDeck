import { mkdir, mkdtemp, writeFile, readFile, unlink, rmdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { windowsRuntime } from './desktop.mjs'
import { launcherScript } from './windows-launcher.mjs'

if (!process.env.WSL_DISTRO_NAME) throw new Error('Run the Windows shortcut smoke test from WSL.')
const runtime = await windowsRuntime()
// Exercise spaces and apostrophes, plus the real wscript/WSL argument parsers.
const root = await mkdtemp("/tmp/opencode/ThreadDeck launcher's test-")
const scripts = path.join(root, 'scripts')
const directory = path.dirname(path.dirname(runtime.executable))
const name = `shortcut-test-${randomUUID()}`
const log = path.join(directory, `${name}.log`)
const script = path.join(directory, `${name}.vbs`)
try {
  await mkdir(scripts)
  await writeFile(path.join(scripts, 'kimaki.mjs'), 'console.log(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),node:process.execPath}))')
  await writeFile(log, '')
  const content = launcherScript({ distro: process.env.WSL_DISTRO_NAME, root, node: process.execPath, nodePath: `${path.dirname(process.execPath)}:/usr/bin:/bin`, log })
    .replace(/^  MsgBox .*$/m, '  WScript.Echo "Shortcut smoke failed"')
  await writeFile(script, content)
  const windowsScript = execFileSync('wslpath', ['-w', script], { encoding: 'utf8' }).trim()
  execFileSync('/mnt/c/Windows/System32/cscript.exe', ['//Nologo', windowsScript], { stdio: 'inherit', timeout: 30_000 })
  const result = JSON.parse((await readFile(log, 'utf8')).trim())
  assert.deepEqual(result.args, ['--desktop'])
  assert.equal(result.cwd, root)
  assert.equal(result.node, process.execPath)
  console.log('Windows shortcut -> hidden WSL -> captured Node -> desktop supervisor command passed. No real Kimaki or dashboard was launched.')
} finally {
  for (const file of [script, log, path.join(scripts, 'kimaki.mjs')]) await unlink(file).catch(() => {})
  await rmdir(scripts).catch(() => {})
  await rmdir(root).catch(() => {})
}
