import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '../components/ui/button'
import { TooltipHint } from '../components/ui/tooltip'

export function CopyMessage({ markdown }: { markdown: string }) {
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle')
  useEffect(() => {
    if (status !== 'copied') return
    const timer = setTimeout(() => setStatus('idle'), 1800)
    return () => clearTimeout(timer)
  }, [status])
  if (!markdown) return null
  return <div className="chat-message-actions">
    <TooltipHint label={status === 'copied' ? 'Copied!' : 'Copy published Markdown'}><Button variant="ghost" size="icon" className="chat-copy-markdown" aria-label="Copy Markdown" disabled={status === 'copying'} onClick={async () => {
      setStatus('copying')
      try { await navigator.clipboard.writeText(markdown); setStatus('copied') } catch { setStatus('error') }
    }}>{status === 'copied' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}</Button></TooltipHint>
    <span className={status === 'error' ? 'chat-copy-error' : 'sr-only'} role="status">{status === 'copied' ? 'Markdown copied' : status === 'error' ? 'Couldn’t copy Markdown. Try again.' : ''}</span>
  </div>
}
