# Local upload storage

Uploads remain on disk in `$THREADDECK_DATA_DIR/uploads`, defaulting to
`~/.local/share/threaddeck/uploads`. Each payload retains its existing UUID
filename and JSON sidecar, so the Kimaki bridge remains compatible.

## Budget and cleanup

- Default payload budget: **2 GiB**, without a global file-count limit.
- Override with `THREADDECK_UPLOAD_BUDGET_BYTES` (a positive integer in bytes).
- New uploads must leave **512 MiB** of filesystem space free.
- Cleanup runs at dashboard startup, hourly, and before staging an upload.
- Unreferenced uploads expire after **10 days**. Removing a file from a draft
  starts its retention period again.
- When space is tight, cleanup reclaims the oldest unreferenced uploads first,
  stopping once enough space is available. A **one-hour grace period** protects
  new uploads and recently removed attachments from pressure/manual cleanup.
- The composer's **Upload storage** disclosure reports usage, unreferenced bytes,
  protected bytes, and offers **Clean unused files**.

The budget covers original payloads and their converted `.audio.ogg` copies.
Small JSON sidecars and the storage index are additional filesystem overhead.
The existing per-file 10 MiB and per-message 10-attachment limits are unchanged.

## Safety and durable references

`server/upload-store.ts` owns indexing, reference tracking, accounting, and
deletion. Its private SQLite index serializes storage mutations across dashboard
processes using `BEGIN IMMEDIATE`; metadata and payloads remain mode 0600.

An upload is atomically associated with its draft when the browser supplies an
owner. Draft changes synchronize the complete reference set, with retries while
the draft is mounted. References remain protected after closing the browser or
restarting the dashboard. Multiple drafts may reference the same upload.

Submissions pin their files **before** forwarding to Kimaki. This also preserves
files when the bridge fails, delivery is uncertain, or execution is queued.
Cleanup removes only unreferenced uploads, never arbitrary files in the directory.
Existing uploads are imported as protected **legacy** files: age alone cannot
prove they are no longer referenced by old conversations.

## Deliberate limitation: submitted files do not expire yet

The bridge hands local `file:` paths to OpenCode. Submission acknowledgment only
confirms dispatch, not completion of every local consumer, and queued prompts or
conversation metadata can still reference those paths. Therefore submitted and
legacy files stay protected indefinitely in this implementation.

Automatically expiring successfully delivered files needs a bridge-level durable
reference/completion contract (including queues, restarts, uncertain delivery,
and historical local-path references). Until that exists, deleting them ten
days after HTTP success would be unsafe. The storage panel explicitly reports
these protected bytes; cleanup does not silently evict them at the budget limit.

## Verification

Run `npx vitest run server/upload-store.test.ts server/chat.test.ts
src/chat/upload-storage.test.tsx src/chat/drafts.test.tsx` for the storage lifecycle,
HTTP integration, draft synchronization, and storage-panel tests.
