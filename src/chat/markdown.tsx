import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useEffect, useState, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '../components/ui/button'
import { CopyWarning } from './copy-warning'
import './markdown.css'

function CodeBlock({ children }: { children?: ReactNode }) {
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle')
  useEffect(() => {
    if (status !== 'copied') return
    const timer = setTimeout(() => setStatus('idle'), 1800)
    return () => clearTimeout(timer)
  }, [status])
  return <div className="chat-code-block"><div className="chat-code"><Button variant="ghost" size="icon" aria-label={status === 'copied' ? 'Code copied' : 'Copy code'} disabled={status === 'copying'} onClick={async event => {
    const text = event.currentTarget.parentElement?.querySelector('pre')?.textContent || ''
    setStatus('copying')
    try { await navigator.clipboard.writeText(text); setStatus('copied') } catch { setStatus('error') }
  }}>{status === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}</Button><pre>{children}</pre></div>
    {status === 'error' && <CopyWarning>Couldn’t copy code. Try again.</CopyWarning>}
  </div>
}

export function ChatMarkdown({ text }: { text: string }) {
  return <div className="chat-markdown"><Markdown remarkPlugins={[remarkGfm]} components={{
    img: ({ alt }) => <span className="chat-muted">{alt || 'External image'} · view the original message in Discord</span>,
    a: ({ href, children }) => {
      let safe = false
      try { const url = new URL(href || ''); safe = url.protocol === 'https:' && !url.username && !url.password } catch { /* no navigation for relative/unsafe links */ }
      return safe ? <a data-chat-external href={href} target="_blank" rel="noreferrer noopener">{children}</a> : <span>{children}</span>
    },
    pre: CodeBlock,
  }}>{text}</Markdown></div>
}
