import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { ChatCatalog } from '../../shared/chat'
import { entryCategory, invocation, parseInvocation, slashMatches, type SlashEntry } from '../../shared/slash'
import './slash.css'

export function useSlashPicker({ text, catalog, loading, error, retry, select }: { text: string; catalog: ChatCatalog; loading?: boolean; error?: string; retry?: () => void; select: (entry: SlashEntry) => void }) {
  const [dismissed, setDismissed] = useState<string | null>(null), [index, setIndex] = useState(0)
  const id = useId(), list = useRef<HTMLDivElement>(null)
  const parsed = parseInvocation(text, catalog.entries)
  const open = /^\/[^\n]*$/.test(text) && !(parsed && /\s/.test(text.slice(1))) && dismissed !== text
  const matches = slashMatches(text, catalog.entries)
  const active = Math.min(index, Math.max(0, matches.length - 1))
  useEffect(() => { setIndex(0); setDismissed(null) }, [text])
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' }) }, [active, text])
  function keyDown(event: KeyboardEvent, vimNormal = false, preserveEscape = false) {
    if (!open || event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey || vimNormal) return false
    if (event.key === 'Escape') { setDismissed(text); if (preserveEscape) return false }
    else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && matches.length) setIndex((active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length)
    else if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey && matches[active]) select(matches[active])
    else return false
    event.preventDefault(); event.stopPropagation(); return true
  }
  const popup = open && <div className="chat-command-list slash-picker" ref={list}>
    <header>Commands, skills & MCP prompts <span>↑ ↓ · Tab / Enter select · Esc close</span></header>
    {loading ? <p role="status">Loading project commands…</p> : error ? <p role="alert">{error} <button onClick={retry}>Retry</button></p> : <>
      <div role="listbox" id={id} aria-label="Available commands and skills">{matches.map((entry, position) => <button type="button" role="option" id={`${id}-${position}`} aria-selected={position === active} key={`${entry.kind}:${entry.name}`} onMouseDown={event => event.preventDefault()} onMouseMove={() => setIndex(position)} onClick={() => select(entry)}>
        <strong>{invocation(entry, catalog.entries)}</strong><span className="slash-category">{entryCategory(entry)}</span><small>{entry.description || 'No description provided.'}</small>
      </button>)}</div>
      {!matches.length && <p role="status">No matching commands or skills.</p>}
    </>}
  </div>
  return { popup, keyDown, expanded: open, controls: open ? id : undefined, activeDescendant: open && matches.length ? `${id}-${active}` : undefined }
}
