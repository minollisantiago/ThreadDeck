import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useState } from 'react'

export function ChatMarkdown({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return <div className="chat-markdown"><Markdown remarkPlugins={[remarkGfm]} components={{
    img: ({ alt }) => <span className="chat-muted">{alt || 'External image'} · view the original message in Discord</span>,
    a: ({ href, children }) => {
      let safe = false
      try { const url = new URL(href || ''); safe = url.protocol === 'https:' && !url.username && !url.password } catch { /* no navigation for relative/unsafe links */ }
      return safe ? <a data-chat-external href={href} target="_blank" rel="noreferrer noopener">{children}</a> : <span>{children}</span>
    },
    pre: ({ children }) => <div className="chat-code"><button onClick={async event => {
      const text = event.currentTarget.parentElement?.querySelector('pre')?.textContent || ''
      try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { setCopied(false) }
    }}>{copied ? 'Copied' : 'Copy'}</button><pre>{children}</pre></div>,
  }}>{text}</Markdown></div>
}
