import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import { ArrowLeft, Code2, Download } from 'lucide-react'

export function safePreview(html: string) {
  const parser = new DOMParser(), source = parser.parseFromString(html, 'text/html'), styles = new Map<string, string>()
  // DOMPurify's XML guard drops whole stylesheets containing valid CSS syntax
  // such as @property { syntax: "<percentage>" }. Keep that guard enabled for
  // markup; restore only HTML-parsed stylesheet text under the static CSP.
  for (const style of source.querySelectorAll('style')) {
    if (style.namespaceURI !== 'http://www.w3.org/1999/xhtml') continue
    const marker = `threaddeck-preview-style-${crypto.randomUUID()}`
    styles.set(marker, style.textContent || ''); style.textContent = marker
  }
  const clean = DOMPurify.sanitize(source.documentElement.outerHTML, { WHOLE_DOCUMENT: true, ADD_TAGS: ['style'], FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'base', 'meta', 'link', 'form'], FORBID_ATTR: ['srcdoc', 'action', 'formaction', 'autofocus'] })
  const document = parser.parseFromString(clean, 'text/html')
  for (const style of document.querySelectorAll('style')) {
    const css = styles.get(style.textContent || '')
    if (css !== undefined) style.textContent = css.replace(/<\/style/gi, '<\\/style')
  }
  const policy = document.createElement('meta')
  policy.httpEquiv = 'Content-Security-Policy'; policy.content = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'"
  document.head.prepend(policy)
  return '<!doctype html>' + document.documentElement.outerHTML
}
export function HtmlPreview({ name, url, close }: { name: string; url: string; close: () => void }) {
  return <AttachmentPreview key={url} name={name} url={url} close={close} />
}

function PreviewPermission({ choose }: { choose: (trusted: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close() }, [])
  return <dialog ref={ref} className="chat-preview-permission" aria-labelledby="preview-permission-title" onCancel={event => { event.preventDefault(); choose(false) }}>
    <h2 id="preview-permission-title">Trust this HTML file?</h2>
    <p>Interactive preview runs the file’s JavaScript and allows network requests. It can send information to external sites. <strong>Only enable it for files you trust.</strong></p>
    <div><button autoFocus onClick={() => choose(false)}>Safe preview</button><button onClick={() => choose(true)}>Interactive preview</button></div>
  </dialog>
}

function AttachmentPreview({ name, url, close }: { name: string; url: string; close: () => void }) {
  const [trusted, setTrusted] = useState<boolean | null>(null)
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
  const previewDocument = useMemo(() => trusted === null ? '' : trusted ? html : safePreview(html), [html, trusted])
  return <section className="chat-html-preview"><div className="chat-preview-toolbar"><button onClick={close}><ArrowLeft size={14} />Back to chat <kbd>Esc</kbd></button><strong>{name}</strong><button onClick={() => setSource(s => !s)}><Code2 size={14} />{source ? 'Preview' : 'Source'}</button><a href={url} download={name}><Download size={14} />Download</a></div>
    {trusted === null && <PreviewPermission choose={setTrusted} />}
    {error ? <p role="alert">{error}</p> : source ? <pre className="chat-html-source">{html}</pre> : trusted === null ? <p role="status">Choose a preview mode to render this file.</p> : <div className="chat-preview-scroll" tabIndex={0} aria-label={trusted ? 'Interactive HTML preview' : 'Static HTML preview'}><iframe key={trusted ? 'interactive' : 'static'} title={name} inert={!trusted} tabIndex={trusted ? 0 : -1} sandbox={trusted ? 'allow-scripts' : ''} referrerPolicy="no-referrer" srcDoc={previewDocument} style={{ height }} /></div>}
    {trusted !== null && <div className="chat-preview-foot">{trusted ? 'Trusted interactive sandbox · scripts and network enabled' : 'Static sandbox · no scripts or network'}<button onClick={() => setTrusted(trusted ? false : null)}>{trusted ? 'Switch to safe preview' : 'Enable interactive preview…'}</button><label>Page height <input aria-label="Preview height" type="range" min="800" max="8000" step="200" value={height} onChange={e => setHeight(Number(e.target.value))} /></label></div>}
  </section>
}
