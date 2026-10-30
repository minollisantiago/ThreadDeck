import type { ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import './copy-warning.css'

export function CopyWarning({ children }: { children: ReactNode }) {
  return <span className="chat-copy-error chat-copy-warning" role="status"><TriangleAlert size={14} aria-hidden="true" /><span>{children}</span></span>
}
