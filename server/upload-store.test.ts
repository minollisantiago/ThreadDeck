import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { UploadStore } from './upload-store'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })
const retention = 10 * 24 * 60 * 60 * 1000
function setup(budget = 2 * 1024 ** 3) {
  const directory = mkdtempSync(path.join(tmpdir(), 'threaddeck-storage-')); directories.push(directory)
  let now = 1_000_000_000
  const store = new UploadStore(directory, { budget, reserve: 0, now: () => now })
  return { store, directory, advance: (ms: number) => { now += ms } }
}
it('defaults to 2 GiB and accepts more than 128 files', () => {
  const { store } = setup()
  mkdirSync(store.directory)
  for (let i = 0; i < 128; i++) writeFileSync(path.join(store.directory, `${randomUUID()}.file.png`), 'x')
  store.upload('image.png', Buffer.from('x'))
  expect(store.status()).toMatchObject({ count: 129, used: 129, budget: 2 * 1024 ** 3 })
})
it('expires abandoned uploads after ten days, including their metadata', () => {
  const { store, advance } = setup()
  const { id } = store.upload('image.png', Buffer.from('x'))
  advance(7 * 24 * 60 * 60 * 1000); expect(store.status(true).count).toBe(1)
  advance(3 * 24 * 60 * 60 * 1000 - 1); expect(store.status(true).count).toBe(1)
  advance(1); expect(store.status(true).count).toBe(0)
  expect(existsSync(path.join(store.directory, `${id}.json`))).toBe(false)
  expect(existsSync(path.join(store.directory, `${id}.file.png`))).toBe(false)
})
it('protects persistent drafts across store instances and removes only the final reference', () => {
  const { store, directory, advance } = setup()
  const file = store.upload('image.png', Buffer.from('x'), 'first')
  store.draft('second', [file.id]); store.draft('first', [])
  advance(retention * 2)
  expect(new UploadStore(directory).status(true).count).toBe(1)
  store.draft('second', []); advance(retention)
  expect(store.status(true).count).toBe(0)
})
it('preserves submitted files even when drafts clear and the process restarts', () => {
  const { store, advance } = setup()
  const file = store.upload('image.png', Buffer.from('x'), 'draft')
  store.protect([file.id]); store.draft('draft', []); advance(retention * 10)
  expect(store.clean()).toMatchObject({ count: 1, protected: 1, reclaimable: 0 })
})
it('migrates old files conservatively rather than deleting unknown session references', () => {
  const { store, advance } = setup()
  mkdirSync(store.directory)
  const id = randomUUID()
  writeFileSync(path.join(store.directory, `${id}.file.png`), 'legacy')
  advance(retention * 10)
  expect(store.clean()).toMatchObject({ count: 1, protected: 6 })
})
it('reclaims oldest eligible files under pressure but never a fresh upload or protected draft', () => {
  const { store, advance } = setup(3)
  store.upload('old.png', Buffer.from('xx'))
  advance(60 * 60 * 1000)
  const current = store.upload('current.png', Buffer.from('xx'), 'draft')
  expect(store.status()).toMatchObject({ count: 1, used: 2 })
  expect(() => store.upload('overflow.png', Buffer.from('xx'))).toThrow('storage budget')
  expect(existsSync(path.join(store.directory, `${current.id}.file.png`))).toBe(true)
})
it('reconciles externally removed payloads and ignores unrelated files', () => {
  const { store } = setup()
  const file = store.upload('image.png', Buffer.from('x'))
  rmSync(path.join(store.directory, `${file.id}.file.png`))
  writeFileSync(path.join(store.directory, 'unrelated.txt'), 'keep')
  expect(store.clean().count).toBe(0)
  expect(existsSync(path.join(store.directory, 'unrelated.txt'))).toBe(true)
})
it('validates the budget and rejects unknown file references', () => {
  const { store, directory } = setup()
  expect(() => new UploadStore(directory, { budget: -1 })).toThrow('Invalid upload storage budget')
  expect(() => store.protect([randomUUID()])).toThrow('unavailable')
})
it('leaves the configured free-disk reserve untouched', () => {
  const { directory } = setup()
  const store = new UploadStore(directory, { reserve: Number.MAX_SAFE_INTEGER })
  expect(() => store.upload('image.png', Buffer.from('x'))).toThrow('free-disk reserve')
  expect(store.status().count).toBe(0)
})
it('accounts for converted audio and removes it with its expired original', () => {
  const { store, advance } = setup()
  const { id } = store.upload('recording.webm', Buffer.from('raw'))
  const converted = path.join(store.directory, `${id}.file.webm.audio.ogg`)
  writeFileSync(converted, 'converted')
  expect(store.status().used).toBe(12)
  advance(retention)
  expect(store.status(true).used).toBe(0)
  expect(existsSync(converted)).toBe(false)
})
it('reclaims only enough oldest files to admit the incoming upload', () => {
  const { store, advance } = setup(4)
  const oldest = store.upload('oldest.png', Buffer.from('x'))
  advance(1)
  const newer = store.upload('newer.png', Buffer.from('x'))
  advance(60 * 60 * 1000)
  store.upload('large.png', Buffer.from('xxx'))
  expect(existsSync(path.join(store.directory, `${oldest.id}.file.png`))).toBe(false)
  expect(existsSync(path.join(store.directory, `${newer.id}.file.png`))).toBe(true)
  expect(store.status().used).toBe(4)
})
it('serializes quota reservations across independent processes', async () => {
  const { directory, store } = setup(3)
  store.status()
  const module = fileURLToPath(new URL('./upload-store.ts', import.meta.url))
  const worker = () => new Promise<number | null>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
      import { UploadStore } from ${JSON.stringify(module)};
      const store = new UploadStore(${JSON.stringify(directory)}, { budget: 3, reserve: 0 });
      try { store.upload('image.png', Buffer.from('xx'), 'worker'); }
      catch (error) { if (error.code !== 'too_large') throw error; process.exitCode = 2; }
    `], { stdio: 'pipe' })
    let errors = ''
    child.stderr.on('data', chunk => { errors += chunk })
    child.once('error', reject)
    child.once('exit', code => { if (code !== 0 && code !== 2) reject(new Error(errors)); else resolve(code) })
  })
  expect((await Promise.all([worker(), worker()])).sort()).toEqual([0, 2])
  expect(store.status()).toMatchObject({ used: 2, count: 1 })
})
