import { FileText, Image } from 'lucide-react'

function Lines({ widths }: { widths: number[] }) {
  return <div className="chat-skeleton-lines">{widths.map((width, index) => <i key={index} className="skeleton-shape skeleton-line" style={{ width: `${width}%` }} />)}</div>
}
function Identity({ user = false }: { user?: boolean }) {
  return <div className="chat-skeleton-identity"><i className={`skeleton-shape skeleton-avatar ${user ? 'user' : ''}`} /><i className="skeleton-shape skeleton-name" /><i className="skeleton-shape skeleton-time" /></div>
}
export function ConversationSkeleton() {
  return <div className="chat-skeleton" role="status" aria-label="Loading conversation"><span className="sr-only">Retrieving messages and attachments…</span><div aria-hidden="true">
    <div className="chat-skeleton-message compact"><Identity user /><Lines widths={[78, 49]} /></div>
    <div className="chat-skeleton-message"><Identity /><Lines widths={[93, 100, 82]} /><div className="chat-skeleton-code"><div className="chat-skeleton-code-dots"><i /><i /><i /></div><Lines widths={[54, 73, 62]} /></div><Lines widths={[88, 56]} /></div>
    <div className="chat-skeleton-message"><Identity /><Lines widths={[76, 91]} /><div className="chat-skeleton-attachments"><div className="skeleton-shape chat-skeleton-image"><Image size={28} strokeWidth={1} /><i className="skeleton-shape skeleton-image-caption" /></div><div className="chat-skeleton-file"><FileText size={24} strokeWidth={1} /><div><i className="skeleton-shape skeleton-line" /><i className="skeleton-shape skeleton-file-meta" /></div></div></div></div>
  </div></div>
}
