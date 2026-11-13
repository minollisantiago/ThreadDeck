import { useEffect, useState } from 'react'
import { uploadStorageSchema } from '../../shared/storage'
import { chatRequest, jsonRequest } from './api'
import type { z } from 'zod'
import './upload-storage.css'

const size = (bytes: number) => `${(bytes / 1024 ** 2).toFixed(1)} MiB`
export function UploadStorage() {
  const [open, setOpen] = useState(false), [status, setStatus] = useState<z.infer<typeof uploadStorageSchema>>()
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  async function load(clean = false) {
    setBusy(true); setError('')
    try { setStatus(await chatRequest(clean ? 'storage/clean' : 'storage', uploadStorageSchema, clean ? jsonRequest({}) : undefined)) }
    catch (error) { setError(error instanceof Error ? error.message : 'Storage unavailable') }
    finally { setBusy(false) }
  }
  useEffect(() => { if (open) void load() }, [open])
  return <details className="chat-upload-storage" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Upload storage</summary>
    {open && <div>
      {status && <p>{size(status.used)} / {size(status.budget)} · {status.count} files<br />{size(status.reclaimable)} unreferenced · {size(status.protected)} protected</p>}
      <p>Unused uploads expire after 10 days. Cleanup keeps a one-hour safety grace period. Drafts, submitted attachments, and legacy files are protected.</p>
      <button type="button" disabled={busy} onClick={() => void load(true)}>Clean unused files</button>
      {error && <p role="alert">{error}</p>}
    </div>}
  </details>
}
