import { useLayoutEffect, useRef, useState } from 'react'
import { Keyboard, X } from 'lucide-react'
import './keyboard-shortcuts.css'
import { CommandReference } from './command-reference'

export function KeyboardShortcuts({ workspace, threadId, close, restoreFocus }: { workspace: boolean; threadId?: string; close: () => void; restoreFocus: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [section, setSection] = useState<'keys' | 'commands'>('keys')
  useLayoutEffect(() => {
    const panel = dialog.current!
    panel.showModal()
    return () => { panel.close(); restoreFocus() }
  }, [restoreFocus])
  const groups = [
    { title: 'Navigation', shortcuts: [
      ...(workspace ? [
        ['Ctrl / ⌘ K', 'Find a session or start a conversation'],
        ['Ctrl / ⌘ Shift N', 'New thread / OpenCode session, inside the session finder'],
        ...(window.threaddeckDesktop ? [['Ctrl Tab', 'Open the session finder (desktop)']] : []),
      ] : []),
      ['Space, Space', workspace ? 'Find a session, outside text fields and controls' : 'Search conversation history, outside text fields and controls'],
      ['/', 'Focus the project/session filter, outside text fields'],
      ['Esc', 'Clear and leave the project/session filter'],
      ['↑ / ↓ · Enter', 'Select and open a result in the session finder'],
    ] },
    ...(workspace ? [{ title: 'Drafting', shortcuts: [
      ['Ctrl / ⌘ P', 'Focus the composer'],
      ['Ctrl / ⌘ P, then P', 'Expand or restore the Markdown editor'],
      ['Ctrl / ⌘ Enter', 'Send now (interrupts a working turn), from the composer'],
      ['Ctrl / ⌘ Shift Enter', 'Queue the prompt, from the composer'],
       ['Esc', 'Leave prompt focus for app shortcuts; in the expanded Vim editor, return to Normal mode without leaving focus'],
    ] }] : []),
    { title: 'Dialogs and previews', shortcuts: [
      ['Esc', 'Close the current dialog or return from HTML preview'],
      ['Tab / Shift Tab', 'Move between controls in a dialog'],
    ] },
  ]
  return <dialog ref={dialog} className="keyboard-shortcuts" aria-labelledby="keyboard-shortcuts-title" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() } }} onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (event.target === dialog.current) close() }}>
    <header><Keyboard aria-hidden="true" size={18} /><h2 id="keyboard-shortcuts-title">Keyboard shortcuts</h2><button autoFocus aria-label="Close keyboard shortcuts" onClick={close}><X size={18} /></button></header>
    {workspace && <div className="keyboard-reference-sections" role="group" aria-label="Help section"><button aria-pressed={section === 'keys'} onClick={() => setSection('keys')}>Keybinds</button><button aria-pressed={section === 'commands'} onClick={() => setSection('commands')}>Commands & skills</button></div>}
    <div className="keyboard-reference-content">{section === 'commands' ? <CommandReference key={threadId} threadId={threadId} /> : <><div className="keyboard-shortcuts-body">{groups.map(group => <section key={group.title}><h3>{group.title}</h3><dl>{group.shortcuts.map(([keys, description]) => <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{description}</dd></div>)}</dl></section>)}</div>
    <footer>Vim navigation applies only inside the expanded editor when Vim is enabled.</footer></>}</div>
  </dialog>
}
