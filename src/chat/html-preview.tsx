import { useEffect, useMemo, useState } from 'react'
import DOMPurify from 'dompurify'
import { ArrowLeft, Code2, Download } from 'lucide-react'

export function safePreview(html: string) {
  const clean = DOMPurify.sanitize(html, { WHOLE_DOCUMENT: true, ADD_TAGS: ['style'], FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'base', 'meta', 'link', 'form'], FORBID_ATTR: ['srcdoc', 'action', 'formaction', 'autofocus'] })
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'">`
  return clean.replace(/<head[^>]*>/i, match => `${match}${policy}`)
}
export function HtmlPreview({ name, url, close }: { name: string; url: string; close: () => void }) {
  const [html, setHtml] = useState(''), [error, setError] = useState(''), [source, setSource] = useState(false), [height, setHeight] = useState(1600)
  useEffect(() => {
    const controller = new AbortController()
    void fetch(url, { signal: controller.signal }).then(async response => {
      if (!response.ok || !response.body) throw new Error('HTML attachment unavailable')
      let size = 0; const chunks: Uint8Array[] = []
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) { size += chunk.length; if (size > 2 * 1024 * 1024) throw new Error('HTML previews are limited to 2 MiB; download this file instead'); chunks.push(chunk) }
      const bytes = new Uint8Array(size); let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
      const text = new TextDecoder().decode(bytes)
      setHtml(text)
    }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [url])
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('.chat-manager.drawer, [popover]:popover-open, dialog[open]')) { event.preventDefault(); close() } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key) }, [close])
  const previewDocument = useMemo(() => safePreview(html), [html])
  return <section className="chat-html-preview"><div className="chat-preview-toolbar"><button onClick={close}><ArrowLeft size={14} />Back to chat <kbd>Esc</kbd></button><strong>{name}</strong><button onClick={() => setSource(s => !s)}><Code2 size={14} />{source ? 'Preview' : 'Source'}</button><a href={url} download={name}><Download size={14} />Download</a></div>
    {error ? <p role="alert">{error}</p> : source ? <pre className="chat-html-source">{html}</pre> : <div className="chat-preview-scroll" tabIndex={0} aria-label="Static HTML preview"><iframe title={name} inert tabIndex={-1} sandbox="" referrerPolicy="no-referrer" srcDoc={previewDocument} style={{ height }} /></div>}
    <div className="chat-preview-foot">Static sandbox · no scripts or network<label>Page height <input aria-label="Preview height" type="range" min="800" max="8000" step="200" value={height} onChange={e => setHeight(Number(e.target.value))} /></label></div>
  </section>
}
