import type { ReactNode } from 'react'
import { Layers2, Unplug } from 'lucide-react'

export function ChatState({ title, detail, children, loading = false }: { title: string; detail: string; children?: ReactNode; loading?: boolean }) {
  const Icon = loading ? Layers2 : Unplug
  return <div className={`chat-state ${loading ? 'loading' : ''}`} role={loading ? 'status' : 'alert'}><div className="chat-state-copy"><div className="chat-state-mark" aria-hidden="true"><Icon size={38} strokeWidth={1.2} /></div><p className="chat-state-eyebrow">{loading ? 'GETTING EVERYTHING READY' : 'CONNECTION UNAVAILABLE'}</p><h2>{title}</h2><p>{detail}</p>{children && <div className="chat-state-actions">{children}</div>}</div></div>
}
