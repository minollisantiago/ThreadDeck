import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readdirSync, lstatSync, writeFileSync, unlinkSync, statfsSync, existsSync, chmodSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { ChatError } from '../shared/chat.ts'

const unusedRetention = 10 * 24 * 60 * 60 * 1000
const uuid = /^[a-f0-9-]{36}$/
export class UploadStore {
  readonly directory: string
  readonly budget: number
  constructor(data: string, private options: { budget?: number; reserve?: number; now?: () => number } = {}) {
    this.directory = path.join(data, 'uploads')
    this.budget = options.budget ?? Number(process.env.THREADDECK_UPLOAD_BUDGET_BYTES || 2 * 1024 ** 3)
    if (!Number.isSafeInteger(this.budget) || this.budget <= 0) throw new Error('Invalid upload storage budget')
  }
  private transaction<T>(work: (db: DatabaseSync, now: number) => T): T {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    const db = new DatabaseSync(path.join(this.directory, 'storage.sqlite'))
    try {
      db.exec(`PRAGMA busy_timeout=5000;
        CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, filename TEXT NOT NULL, size INTEGER NOT NULL, touched INTEGER NOT NULL, state TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS drafts (owner TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY(owner,id));
        BEGIN IMMEDIATE`)
      chmodSync(path.join(this.directory, 'storage.sqlite'), 0o600)
      const now = this.options.now?.() ?? Date.now()
      for (const row of db.prepare('SELECT id, filename FROM files').all()) {
        if (!existsSync(path.join(this.directory, String(row.filename)))) {
          db.prepare('DELETE FROM files WHERE id=?').run(String(row.id))
          db.prepare('DELETE FROM drafts WHERE id=?').run(String(row.id))
        }
      }
      // Old installations have no reference records. Never infer that an old file is unused.
      for (const filename of readdirSync(this.directory)) {
        const match = /^([a-f0-9-]{36})(?:\.file\.[a-z0-9]{1,12}|\.bin)$/i.exec(filename)
        if (!match) continue
        const info = lstatSync(path.join(this.directory, filename))
        if (info.isFile()) {
          let size = info.size
          try { const audio = lstatSync(path.join(this.directory, `${filename}.audio.ogg`)); if (audio.isFile()) size += audio.size } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
          db.prepare('INSERT OR IGNORE INTO files VALUES (?,?,?,?,?)').run(match[1], filename, size, now, 'legacy')
          db.prepare('UPDATE files SET size=? WHERE id=?').run(size, match[1])
        }
      }
      const result = work(db, now)
      db.exec('COMMIT')
      return result
    } catch (error) { try { db.exec('ROLLBACK') } catch {} throw error }
    finally { db.close() }
  }
  private available() { const disk = statfsSync(this.directory); return disk.bavail * disk.bsize }
  private fits(db: DatabaseSync, bytes: number) { return this.usage(db).used + bytes <= this.budget && this.available() - bytes >= (this.options.reserve ?? 512 * 1024 ** 2) }
  private sweep(db: DatabaseSync, now: number, pressure = false, needed?: number) {
    const rows = db.prepare(`SELECT * FROM files WHERE state = 'unused' AND NOT EXISTS (SELECT 1 FROM drafts WHERE drafts.id=files.id) ORDER BY touched`).all()
    for (const row of rows) {
      if (needed !== undefined && this.fits(db, needed)) break
      // A grace period also protects a just-uploaded file before its browser draft sync arrives.
      if (Number(row.touched) > now - (pressure ? 60 * 60 * 1000 : unusedRetention)) continue
      // Delete the payload first; a crash leaves at worst an index entry to reconcile.
      for (const name of [String(row.filename), `${row.filename}.audio.ogg`, `${row.id}.json`]) {
        try { unlinkSync(path.join(this.directory, name)) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      }
      db.prepare('DELETE FROM files WHERE id=?').run(String(row.id))
    }
  }
  private usage(db: DatabaseSync) {
    const rows = db.prepare(`SELECT size, state, EXISTS(SELECT 1 FROM drafts WHERE drafts.id=files.id) AS draft FROM files`).all()
    let used = 0, reclaimable = 0
    for (const row of rows) { used += Number(row.size); if (row.state === 'unused' && !row.draft) reclaimable += Number(row.size) }
    return { used, reclaimable, protected: used - reclaimable, count: rows.length, budget: this.budget }
  }
  status(clean = false) { return this.transaction((db, now) => { if (clean) this.sweep(db, now); return this.usage(db) }) }
  clean() { return this.transaction((db, now) => { this.sweep(db, now, true); return this.usage(db) }) }
  upload(name: string, bytes: Buffer, owner?: string) {
    const result = this.transaction((db, now) => {
      this.sweep(db, now)
      if (!this.fits(db, bytes.length)) this.sweep(db, now, true, bytes.length)
      if (!this.fits(db, bytes.length)) {
        return { error: new ChatError('too_large', 'Upload storage budget or free-disk reserve reached. Active drafts, submitted attachments, and legacy files are protected; review storage before attaching more.') }
      }
      const id = randomUUID(), extension = /^\.[a-z0-9]{1,12}$/i.test(path.extname(name)) ? path.extname(name) : '.bin'
      const filename = `${id}.file${extension}`
      const created: string[] = []
      try {
        writeFileSync(path.join(this.directory, filename), bytes, { mode: 0o600, flag: 'wx' })
        created.push(filename)
        writeFileSync(path.join(this.directory, `${id}.json`), JSON.stringify({ name, path: filename, size: bytes.length, createdAt: now }), { mode: 0o600, flag: 'wx' })
        created.push(`${id}.json`)
        db.prepare('INSERT INTO files VALUES (?,?,?,?,?)').run(id, filename, bytes.length, now, 'unused')
        if (owner) db.prepare('INSERT INTO drafts VALUES (?,?)').run(owner, id)
      } catch (error) { for (const file of created) { try { unlinkSync(path.join(this.directory, file)) } catch {} } throw error }
      return { id, name }
    })
    if ('error' in result) throw result.error
    return result
  }
  draft(owner: string, ids: string[]) {
    this.transaction((db, now) => {
      db.prepare('UPDATE files SET touched=? WHERE id IN (SELECT id FROM drafts WHERE owner=?)').run(now, owner)
      db.prepare('DELETE FROM drafts WHERE owner=?').run(owner)
      for (const id of ids) {
        if (!uuid.test(id)) throw new ChatError('invalid', 'Invalid upload ID')
        db.prepare('INSERT INTO drafts VALUES (?,?)').run(owner, id)
        db.prepare('UPDATE files SET touched=? WHERE id=?').run(now, id)
      }
    })
  }
  protect(ids: string[]) {
    this.transaction((db, now) => {
      for (const id of ids) {
        if (!uuid.test(id) || !db.prepare('SELECT id FROM files WHERE id=?').get(id)) throw new ChatError('invalid', 'An attached file is unavailable. Attach it again.')
        db.prepare("UPDATE files SET state='submitted', touched=? WHERE id=?").run(now, id)
      }
    })
  }
}
