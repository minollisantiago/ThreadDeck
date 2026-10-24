import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { vim, getCM } from '@replit/codemirror-vim'
import { Expand, Paperclip, Square, ArrowUp } from 'lucide-react'
import { type ChatCatalog, chatFileSchema } from '../../shared/chat'
import { chatRequest } from './api'
import type { Draft } from './drafts'

export function PromptComposer({ draft, change, expanded, toggle, enabled, busy, pending, catalog, submit, stop }: {
  draft: Draft; change: (patch: Partial<Draft>) => void; expanded: boolean; toggle: () => void
  enabled: boolean; busy: boolean; pending: boolean; catalog: ChatCatalog; submit: (delivery: 'send' | 'queue') => void; stop: () => void
}) {
  const [vimEnabled, setVim] = useState(() => localStorage.getItem('threaddeck:vim') !== 'false')
  const [mode, setMode] = useState('NORMAL'), [uploadError, setUploadError] = useState(''), [uploading, setUploading] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null), mount = useRef<HTMLDivElement>(null), view = useRef<EditorView | null>(null), fileInput = useRef<HTMLInputElement>(null)
  const latest = useRef({ draft, change, toggle, submit }); latest.current = { draft, change, toggle, submit }
  useLayoutEffect(() => {
    if (!expanded || !mount.current) return
    const d = latest.current.draft
    const editor = new EditorView({ parent: mount.current, state: EditorState.create({ doc: d.text, selection: { anchor: Math.min(d.anchor, d.text.length), head: Math.min(d.head, d.text.length) }, extensions: [
      ...(vimEnabled ? [vim()] : []), basicSetup, markdown(), EditorView.lineWrapping,
      EditorView.theme({ '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--text)' }, '.cm-scroller': { overflow: 'auto' }, '.cm-content': { fontFamily: 'var(--font)', fontSize: '14px', lineHeight: '1.9', padding: '20px 0' }, '.cm-gutters': { background: 'transparent', color: 'var(--subtle)', border: 'none' }, '.cm-activeLine, .cm-activeLineGutter': { background: 'color-mix(in srgb, var(--row) 35%, transparent)' }, '.cm-cursor': { borderLeftColor: 'var(--accent)' }, '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'color-mix(in srgb, var(--accent) 18%, transparent) !important' } }),
      EditorView.updateListener.of(update => { if (update.docChanged || update.selectionSet) latest.current.change({ text: update.state.doc.toString(), anchor: update.state.selection.main.anchor, head: update.state.selection.main.head }) }),
    ] }) })
    view.current = editor; editor.focus(); setMode(vimEnabled ? 'NORMAL' : 'TEXT')
    const cm = getCM(editor), onMode = (event: { mode: string }) => setMode(event.mode.toUpperCase())
    cm?.on('vim-mode-change', onMode)
    return () => { cm?.off('vim-mode-change', onMode); editor.destroy(); view.current = null }
  }, [expanded, vimEnabled])
  useLayoutEffect(() => {
    const editor = view.current
    if (editor && editor.state.doc.toString() !== draft.text) editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: draft.text }, selection: { anchor: Math.min(draft.anchor, draft.text.length), head: Math.min(draft.head, draft.text.length) } })
    if (input.current) { input.current.style.height = 'auto'; input.current.style.height = `${Math.min(180, Math.max(62, input.current.scrollHeight))}px` }
  }, [draft.text])
  useLayoutEffect(() => { if (!expanded) input.current?.setSelectionRange(Math.min(draft.anchor, draft.head), Math.max(draft.anchor, draft.head), draft.anchor > draft.head ? 'backward' : 'forward') }, [expanded])
  useEffect(() => {
    const focus = () => { if (view.current) view.current.focus(); else { input.current?.focus(); const d = latest.current.draft; input.current?.setSelectionRange(Math.min(d.anchor, d.head), Math.max(d.anchor, d.head), d.anchor > d.head ? 'backward' : 'forward') } }
    const expand = () => latest.current.toggle()
    window.addEventListener('threaddeck:composer-focus', focus); window.addEventListener('threaddeck:composer-toggle', expand)
    return () => { window.removeEventListener('threaddeck:composer-focus', focus); window.removeEventListener('threaddeck:composer-toggle', expand) }
  }, [])
  const matches = /^\/[^\s]*$/.test(draft.text) ? catalog.entries.filter(entry => `/${entry.name}${entry.kind === 'skill' ? '-skill' : ''}`.startsWith(draft.text)).slice(0, 12) : []
  const ready = enabled && !pending && !uploading && draft.text.length <= 50_000 && !draft.files.some(file => file.available === false) && Boolean(draft.text.trim() || draft.files.length)
  return <section className={`chat-composer ${expanded ? 'expanded' : ''}`} aria-label={expanded ? 'Expanded prompt editor' : 'Prompt composer'}>
    {expanded && <div className="chat-editor-heading"><span>prompt.md</span><button onClick={toggle}>Back to chat <kbd>Ctrl P · P</kbd></button></div>}
    {matches.length > 0 && <div className="chat-command-list" aria-label="Available commands and skills">{matches.map(entry => <button key={`${entry.kind}:${entry.name}`} onClick={() => { const text = `/${entry.name}${entry.kind === 'skill' ? '-skill' : ''} `; change({ text, anchor: text.length, head: text.length }); input.current?.focus() }}><strong>/{entry.name}{entry.kind === 'skill' ? '-skill' : ''}</strong><small>{entry.kind} · {entry.description}</small></button>)}</div>}
    <div className="chat-composer-box">
      {expanded ? <div ref={mount} className="chat-editor-mount" /> : <textarea ref={input} aria-label="Write a prompt" value={draft.text} placeholder="A thought, a question, a next step…" onChange={event => change({ text: event.target.value, anchor: event.target.selectionStart, head: event.target.selectionEnd })} onSelect={event => { const el = event.currentTarget, anchor = el.selectionDirection === 'backward' ? el.selectionEnd : el.selectionStart, head = el.selectionDirection === 'backward' ? el.selectionStart : el.selectionEnd; if (anchor !== latest.current.draft.anchor || head !== latest.current.draft.head) change({ anchor, head }) }} />}
      {draft.files.length > 0 && <div className="chat-staged-files">{draft.files.map(file => <span key={file.id}>{file.name}{file.available === false && ' · reattach after reload'}<button disabled={uploading} aria-label={`Remove ${file.name}`} onClick={() => change({ files: draft.files.filter(f => f.id !== file.id) })}>×</button></span>)}</div>}
      <div className="chat-composer-tools"><button aria-label="Attach files" disabled={!enabled || uploading || draft.files.length >= 10} onClick={() => fileInput.current?.click()}><Paperclip size={17} /></button><input hidden ref={fileInput} type="file" multiple onChange={async event => {
        const files = [...(event.target.files || [])]; event.target.value = ''; setUploading(true); setUploadError('')
        try {
          if (files.length + latest.current.draft.files.length > 10) throw new Error('Attach at most 10 files')
          let staged = latest.current.draft.files
          for (const file of files) {
            if (file.size > 10 * 1024 * 1024) throw new Error('Files must be at most 10 MiB')
            const uploaded = await chatRequest(`files?name=${encodeURIComponent(file.name)}`, chatFileSchema, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file })
            staged = [...staged, { ...uploaded, available: true }]
            latest.current.change({ files: staged })
          }
        } catch (error) { setUploadError(error instanceof Error ? error.message : 'Upload failed') } finally { setUploading(false) }
      }} /><span>{uploading ? 'Uploading…' : 'Kimaki'}</span><div className="chat-tool-spacer" />{expanded && <button className="chat-vim" onClick={() => { localStorage.setItem('threaddeck:vim', String(!vimEnabled)); setVim(value => !value) }}>Vim {vimEnabled ? 'on' : 'off'}</button>}<button aria-label={expanded ? 'Restore compact composer' : 'Expand composer'} onClick={toggle}><Expand size={16} /></button>{busy && <button onClick={stop}><Square size={12} />Stop</button>}<button className="chat-send" disabled={!ready} onClick={() => submit(busy ? 'queue' : 'send')}>{pending ? 'Pending…' : busy ? 'Queue' : 'Send'}<ArrowUp size={14} /></button></div>
    </div>
    <div className="chat-composer-foot"><span>{expanded ? mode : <><kbd>Ctrl P · P</kbd> expand editor</>}</span>{busy && <button disabled={!ready} onClick={() => submit('send')}>Send now / interrupt</button>}<span className="chat-composer-feedback" role="status">{draft.text.length > 50_000 ? 'Over the 50,000 character prompt limit' : busy ? <span className="chat-agent-activity"><span className="chat-activity-dots" aria-hidden="true"><i /><i /><i /></span><span>Agent is working…</span></span> : 'Draft kept on this device'}</span></div>
    {uploadError && <p className="chat-error" role="alert">{uploadError}</p>}
  </section>
}
