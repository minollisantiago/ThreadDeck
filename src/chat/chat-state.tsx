import type { ReactNode } from 'react'
import { Unplug } from 'lucide-react'

export function ChatState({ title, detail, children }: { title: string; detail: string; children?: ReactNode }) {
  return <div className="chat-state" role="alert"><div className="chat-state-copy"><div className="chat-state-mark" aria-hidden="true"><Unplug size={38} strokeWidth={1.2} /></div><p className="chat-state-eyebrow">CONNECTION UNAVAILABLE</p><h2>{title}</h2><p>{detail}</p>{children && <div className="chat-state-actions">{children}</div>}</div></div>
}
