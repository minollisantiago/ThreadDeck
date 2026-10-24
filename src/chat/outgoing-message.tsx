import { FileText } from 'lucide-react'
import { ChatMarkdown } from './markdown'

export function OutgoingMessage({ text, files, state, queued, restore, canRestore }: { text: string; files: { id: string; name: string }[]; state: string; queued: boolean; restore: () => void; canRestore: boolean }) {
  const attention = state === 'unknown' || state === 'failed'
  return <article className="chat-message user chat-outgoing" data-state={state} aria-label="Outgoing prompt"><div className="chat-message-meta"><span className="chat-avatar">Y</span><strong>You</strong><small role="status">{state === 'submitted' ? queued ? 'Queued' : 'Sent' : attention ? state === 'failed' ? 'Couldn’t send' : 'Delivery uncertain' : 'Sending…'}</small></div>{text && <ChatMarkdown text={text} />}{files.length > 0 && <div className="chat-staged-files">{files.map(file => <span key={file.id}><FileText size={13} />{file.name}</span>)}</div>}{attention && <button className="chat-restore-prompt" onClick={restore} disabled={!canRestore} title={canRestore ? 'Put this prompt back in the editor without resending it' : 'Save or clear your current draft before restoring this prompt'}>Restore prompt</button>}</article>
}
