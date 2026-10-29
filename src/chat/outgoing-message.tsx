import { ChatMarkdown } from './markdown'
import { TooltipHint } from '../components/ui/tooltip'
import { AttachmentRow } from './attachment-row'

export function OutgoingMessage({ text, files, state, queued, restore, canRestore }: { text: string; files: { id: string; name: string; size?: number }[]; state: string; queued: boolean; restore: () => void; canRestore: boolean }) {
  const attention = state === 'unknown' || state === 'failed'
  return <article className="chat-message user chat-outgoing" data-state={state} aria-label="Outgoing prompt"><div className="chat-avatar-rail" aria-hidden="true"><span className="chat-avatar">Y</span></div><div className="chat-message-content"><div className="chat-message-meta"><strong>You</strong><small role="status">{state === 'submitted' ? queued ? 'Queued' : 'Sent' : attention ? state === 'failed' ? 'Couldn’t send' : 'Delivery uncertain' : 'Sending…'}</small></div>{text && <ChatMarkdown text={text} />}{files.length > 0 && <div className="chat-staged-files">{files.map(file => <AttachmentRow key={file.id} name={file.name} size={file.size} />)}</div>}{attention && <TooltipHint label={canRestore ? 'Put this prompt back in the editor without resending it' : 'Save or clear your current draft before restoring this prompt'}><button className="chat-restore-prompt" onClick={restore} disabled={!canRestore}>Restore prompt</button></TooltipHint>}</div></article>
}
