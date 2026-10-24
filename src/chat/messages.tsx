import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { FileCode, FileText } from 'lucide-react'
import { z } from 'zod'
import { type PublishedMessage } from '../../shared/chat'
import { ChatMarkdown } from './markdown'

export function attachmentUrl(threadId: string, messageId: string, id: string) { return `/api/chat/threads/${threadId}/messages/${messageId}/attachments/${id}` }
const componentSchema = z.looseObject({ type: z.number(), content: z.string().optional(), components: z.array(z.unknown()).optional(), accessory: z.unknown().optional(), accent_color: z.number().optional(), label: z.string().optional(), items: z.array(z.unknown()).optional(), media: z.unknown().optional(), file: z.unknown().optional() })
const embedSchema = z.object({ title: z.string().optional(), description: z.string().optional(), fields: z.array(z.object({ name: z.string(), value: z.string() })).optional() })
function ImageViewer({ src, name, close }: { src: string; name: string; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => { const previous = document.activeElement; ref.current?.showModal(); return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus() } }, [])
  return <dialog className="chat-image-dialog" ref={ref} aria-label={name} onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (event.target === ref.current) close() }}><button autoFocus onClick={close}>Close image</button><img src={src} alt={name} /></dialog>
}
export function PublishedMessages({ messages, threadId, discordUrl, preview }: { messages: PublishedMessage[]; threadId: string; discordUrl?: string; preview: (name: string, url: string) => void }) {
  const [image, setImage] = useState<{ src: string; name: string } | null>(null)
  function fileView(message: PublishedMessage, file: PublishedMessage['attachments'][number]): ReactNode {
    const url = attachmentUrl(threadId, message.id, file.id)
    const html = /\.html?$/i.test(file.filename) || file.content_type === 'text/html'
    const inline = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.content_type || '')
    return inline ? <div key={file.id} className="chat-image"><button aria-label={`Enlarge ${file.filename}`} onClick={() => setImage({ src: url, name: file.filename })}><img src={url} alt={file.filename} loading="lazy" /></button><span>{file.filename}<a href={url} download={file.filename}>Download</a></span></div> : <div key={file.id} className="chat-file">{html ? <FileCode size={20} /> : <FileText size={20} />}<strong>{file.filename}</strong><small>{Math.ceil(file.size / 1024)} KiB</small>{html && <button onClick={() => preview(file.filename, url)}>Preview HTML</button>}<a href={url} download={file.filename}>Download</a></div>
  }
  function component(value: unknown, key: string, message: PublishedMessage, used: Set<string>): ReactNode {
    const parsed = componentSchema.safeParse(value)
    if (!parsed.success) return <p key={key} className="chat-muted">Unsupported Discord content{discordUrl && <> · <a href={discordUrl}>Open in Discord</a></>}</p>
    const item = parsed.data
    if (item.type === 10) return <ChatMarkdown key={key} text={item.content || ''} />
    if (item.type === 14) return <hr key={key} />
    if ([1, 9, 17].includes(item.type)) return <div key={key} className={item.type === 17 ? 'chat-container' : 'chat-component-group'} style={item.accent_color !== undefined ? { '--chat-container-accent': `#${item.accent_color.toString(16).padStart(6, '0')}` } as CSSProperties : undefined}>{item.components?.map((child, i) => component(child, `${key}-${i}`, message, used))}{item.accessory ? component(item.accessory, `${key}-accessory`, message, used) : null}</div>
    if ([12, 13, 11].includes(item.type)) {
      const media = item.type === 12 ? item.items || [] : [{ media: item.media || item.file }]
      return <div className="chat-attachments" key={key}>{media.map((raw, i) => {
        const parsed = z.object({ media: z.object({ url: z.string() }), description: z.string().optional() }).safeParse(raw)
        const file = parsed.success ? message.attachments.find(file => file.url === parsed.data.media.url || `attachment://${file.filename}` === parsed.data.media.url) : undefined
        if (file) { if (used.has(file.id)) return null; used.add(file.id); return fileView(message, file) }
        return <p key={i} className="chat-muted">{parsed.success ? parsed.data.description || 'External media' : 'Media'}{discordUrl && <> · <a href={discordUrl}>View in Discord</a></>}</p>
      })}</div>
    }
    return <div key={key} className="chat-action-unavailable"><span>{item.label || 'Discord interaction'}</span>{discordUrl ? <a href={discordUrl}>Respond in Discord</a> : <span>Not available in this client yet</span>}</div>
  }
  return <>{messages.map(message => { const used = new Set<string>(); return <article className={`chat-message ${message.author.bot ? 'assistant' : 'user'}`} key={message.id} data-message-id={message.id}>
    <div className="chat-message-meta"><span className="chat-avatar">{message.author.bot ? 'K' : (message.author.global_name || message.author.username).slice(0, 1)}</span><strong>{message.author.global_name || message.author.username}</strong><time dateTime={message.timestamp}>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>{message.edited_timestamp && <small>edited</small>}</div>
    {message.content && <ChatMarkdown text={message.content} />}
    {message.components.map((item, i) => component(item, `${message.id}-${i}`, message, used))}
    {message.embeds.map((raw, i) => { const embed = embedSchema.safeParse(raw); return embed.success ? <div className="chat-container" key={i}>{embed.data.title && <strong>{embed.data.title}</strong>}{embed.data.description && <ChatMarkdown text={embed.data.description} />}{embed.data.fields?.map((field, n) => <div key={n}><strong>{field.name}</strong><ChatMarkdown text={field.value} /></div>)}</div> : null })}
    {message.attachments.some(file => !used.has(file.id)) && <div className="chat-attachments">{message.attachments.filter(file => !used.has(file.id)).map(file => fileView(message, file))}</div>}
  </article> })}{image && <ImageViewer src={image.src} name={image.name} close={() => setImage(null)} />}</>
}
