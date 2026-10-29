import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { vim, getCM } from '@replit/codemirror-vim'
import { Cpu, Expand, Paperclip, Square, ArrowUp } from 'lucide-react'
import { type ChatCatalog, chatFileSchema } from '../../shared/chat'
import { chatRequest } from './api'
import type { Draft } from './drafts'
import type { Session } from '../../shared/model'
import { TooltipHint } from '../components/ui/tooltip'
import { inlineAudioType } from '../../shared/audio'
import { AudioRecorder } from './audio-recorder'
import { AttachmentRow } from './attachment-row'

export function PromptComposer({ draft, change, expanded, toggle, enabled, busy, pending, catalog, submit, stop, model, audioEnabled = false, onBusyChange }: {
  draft: Draft; change: (patch: Partial<Draft>) => void; expanded: boolean; toggle: () => void
  enabled: boolean; busy: boolean; pending: boolean; catalog: ChatCatalog; submit: (delivery: 'send' | 'queue') => void; stop: () => void
  model?: Session['model']
  audioEnabled?: boolean
  onBusyChange?: (busy: boolean) => void
}) {
  const [vimEnabled, setVim] = useState(() => localStorage.getItem('threaddeck:vim') !== 'false')
  const [mode, setMode] = useState('NORMAL'), [uploadError, setUploadError] = useState(''), [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false), dragDepth = useRef(0), uploadLock = useRef(false)
  const [recording, setRecording] = useState(false)
  const [submitRecording, setSubmitRecording] = useState(false)
  const [recordControls, setRecordControls] = useState<HTMLSpanElement | null>(null)
  useEffect(() => { onBusyChange?.(recording || uploading) }, [recording, uploading, onBusyChange])
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
  const ready = enabled && !pending && !uploading && !recording && draft.text.length <= 50_000 && !draft.files.some(file => file.available === false) && (!draft.files.some(file => file.audioPrompt) || audioEnabled) && Boolean(draft.text.trim() || draft.files.length)
  useEffect(() => {
    if (!submitRecording || recording || uploading) return
    setSubmitRecording(false)
    if (ready) latest.current.submit(busy ? 'queue' : 'send')
    else setUploadError('Recording attached. Check the prompt and connection before sending.')
  }, [submitRecording, recording, uploading, ready, busy])
  async function uploadFiles(files: File[], recorded = false) {
    if (!files.length) return
    if (recording && !recorded) { setUploadError('Stop or cancel your recording before attaching another file.'); return }
    if (uploadLock.current) { const error = new Error('Files are still uploading. Try again when they finish.'); setUploadError(error.message); if (recorded) throw error; return }
    if (!enabled) { const error = new Error('Wait for the conversation to connect before attaching files.'); setUploadError(error.message); if (recorded) throw error; return }
    uploadLock.current = true; setUploading(true); setUploadError('')
    try {
      if (files.length + latest.current.draft.files.length > 10) throw new Error('Attach at most 10 files')
      if (files.some(file => file.size > 10 * 1024 * 1024)) throw new Error('Files must be at most 10 MiB')
      for (const file of files) {
        const uploaded = await chatRequest(`files?name=${encodeURIComponent(file.name)}`, chatFileSchema, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file })
        const audioPrompt = audioEnabled && Boolean(inlineAudioType(file.name, file.type)) && !latest.current.draft.files.some(file => file.audioPrompt)
        latest.current.change({ files: [...latest.current.draft.files, { ...uploaded, size: file.size, ...(audioPrompt && { audioPrompt: true }), available: true }] })
      }
    } catch (error) { setUploadError(error instanceof Error ? error.message : 'Upload failed'); if (recorded) throw error } finally { uploadLock.current = false; setUploading(false) }
  }
  return <section className={`chat-composer ${expanded ? 'expanded' : ''} ${dragging ? 'dragging-files' : ''}`} aria-label={expanded ? 'Expanded prompt editor' : 'Prompt composer'} onKeyDownCapture={event => {
    if (event.key !== 'Escape' || event.nativeEvent.isComposing || !(event.target instanceof HTMLElement) || !event.target.closest('textarea,.cm-content')) return
    // Escape belongs to Vim in every mode, including repeated presses in Normal.
    if (expanded && vimEnabled) return
    event.preventDefault(); event.stopPropagation(); event.target.blur()
  }} onPasteCapture={event => {
    if (!(event.target instanceof HTMLElement) || !event.target.closest('textarea,.cm-content')) return
    const items = [...event.clipboardData.items].filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => Boolean(file))
    const images = items.length ? items : [...event.clipboardData.files].filter(file => file.type.startsWith('image/'))
    if (!images.length) return // Leave ordinary text pastes to the textarea or CodeMirror.
    event.preventDefault(); event.stopPropagation()
    const files = images.map((file, index) => {
      if (file.name) return file
      const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]?.split('+')[0].replace(/[^a-z0-9]/gi, '') || 'png'
      return new File([file], `screenshot-${Date.now()}-${index + 1}.${extension}`, { type: file.type })
    })
    void uploadFiles(files)
  }} onDragEnter={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); dragDepth.current++; if (enabled && !uploadLock.current) setDragging(true) } }} onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = enabled && !uploadLock.current ? 'copy' : 'none' } }} onDragLeave={event => { if (event.dataTransfer.types.includes('Files')) { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false) } }} onDropCapture={event => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); event.stopPropagation(); dragDepth.current = 0; setDragging(false); void uploadFiles([...event.dataTransfer.files]) }}>
    {expanded && <div className="chat-editor-heading"><button onClick={toggle}>Back to chat <kbd>Ctrl P · P</kbd></button></div>}
    {matches.length > 0 && <div className="chat-command-list" aria-label="Available commands and skills">{matches.map(entry => <button key={`${entry.kind}:${entry.name}`} onClick={() => { const text = `/${entry.name}${entry.kind === 'skill' ? '-skill' : ''} `; change({ text, anchor: text.length, head: text.length }); input.current?.focus() }}><strong>/{entry.name}{entry.kind === 'skill' ? '-skill' : ''}</strong><small>{entry.kind} · {entry.description}</small></button>)}</div>}
    <div className="chat-composer-box">
      {busy && <div className="chat-composer-status" role="status" aria-label="Agent activity"><span className="chat-agent-activity"><span className="chat-activity-dots" aria-hidden="true"><i /><i /><i /></span><span>Agent is working…</span></span></div>}
      {dragging && <div className="chat-drop-hint" aria-hidden="true"><Paperclip size={22} /><strong>Drop files to attach</strong><span>Up to 10 files · 10 MiB each</span></div>}
      {expanded ? <div ref={mount} className="chat-editor-mount" /> : <textarea ref={input} aria-label="Write a prompt" value={draft.text} placeholder="Ask anything, / for commands and skills, or attach files…" onChange={event => change({ text: event.target.value, anchor: event.target.selectionStart, head: event.target.selectionEnd })} onSelect={event => { const el = event.currentTarget, anchor = el.selectionDirection === 'backward' ? el.selectionEnd : el.selectionStart, head = el.selectionDirection === 'backward' ? el.selectionStart : el.selectionEnd; if (anchor !== latest.current.draft.anchor || head !== latest.current.draft.head) change({ anchor, head }) }} />}
      {draft.files.length > 0 && <div className="chat-staged-files">{draft.files.map(file => audioEnabled && inlineAudioType(file.name) ? <span key={file.id}>{file.name}{file.available === false && ' · reattach after reload'}<label className="chat-audio-prompt-toggle"><input type="checkbox" checked={Boolean(file.audioPrompt)} onChange={event => change({ files: draft.files.map(item => ({ ...item, audioPrompt: item.id === file.id ? event.target.checked : false })) })} />Audio prompt</label><button disabled={uploading || recording} aria-label={`Remove ${file.name}`} onClick={() => change({ files: draft.files.filter(f => f.id !== file.id) })}>×</button></span> : <AttachmentRow key={file.id} name={file.name} size={file.size} available={file.available} disabled={uploading || recording} remove={() => change({ files: draft.files.filter(f => f.id !== file.id) })} />)}</div>}
      {audioEnabled && <AudioRecorder controls={recordControls} enabled={enabled && !pending && !uploading} attached={draft.files.some(file => Boolean(file.audioPrompt))} onBusy={setRecording} onRecord={file => uploadFiles([file], true)} onSubmit={() => setSubmitRecording(true)} submitLabel={busy ? 'Queue recording' : 'Send recording'} />}
      {draft.files.some(file => file.audioPrompt) && <p className="chat-audio-notice">Kimaki transcribes and runs your audio when you send. Recording and transcript are published to Discord.</p>}
      <div className="chat-composer-tools"><button aria-label="Attach files" disabled={!enabled || uploading || draft.files.length >= 10} onClick={() => fileInput.current?.click()}><Paperclip size={17} /></button><input hidden ref={fileInput} type="file" multiple onChange={async event => {
        const files = [...(event.target.files || [])]; event.target.value = ''; await uploadFiles(files)
      }} /><TooltipHint label={model ? `${model.providerID}/${model.id}${model.variant ? ` · ${model.variant}` : ''}` : 'This session has not reported its model yet'}><span className="chat-model" role="status" aria-label="Session model"><Cpu size={13} aria-hidden="true" /><span className="chat-model-name">{uploading ? 'Uploading…' : model ? `${model.id}${model.variant ? ` · ${model.variant}` : ''}` : 'Model unavailable'}</span></span></TooltipHint><div className="chat-tool-spacer" />{expanded && <>{vimEnabled && <span className="chat-vim-mode" role="status" aria-label="Vim mode">{mode}</span>}<button className="chat-vim" onClick={() => { localStorage.setItem('threaddeck:vim', String(!vimEnabled)); setVim(value => !value) }}>Vim {vimEnabled ? 'on' : 'off'}</button></>}
      <TooltipHint label={<>{expanded ? 'Restore compact composer' : 'Expand composer'} <kbd>Ctrl P · P</kbd></>}><button aria-label={expanded ? 'Restore compact composer' : 'Expand composer'} onClick={toggle}><Expand size={16} /></button></TooltipHint>
      {busy && <button onClick={stop}><Square size={12} />Stop</button>}<span className="chat-record-control" ref={setRecordControls} />{!recording && <button className="chat-send" aria-label={pending ? 'Pending…' : busy ? 'Queue' : 'Send'} disabled={!ready} onClick={() => submit(busy ? 'queue' : 'send')}><ArrowUp size={14} aria-hidden="true" /></button>}</div>
    </div>
    {(!expanded || busy || draft.text.length > 50_000) && <div className="chat-composer-foot">{!expanded && <span><kbd>Ctrl P · P</kbd> expand editor</span>}{busy && <button disabled={!ready} onClick={() => submit('send')}>Send now / interrupt</button>}{draft.text.length > 50_000 && <span className="chat-composer-feedback" role="status">Over the 50,000 character prompt limit</span>}</div>}
    {uploadError && <p className="chat-error" role="alert">{uploadError}</p>}
  </section>
}
