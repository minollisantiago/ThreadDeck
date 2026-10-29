import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { z } from 'zod'
import { type PublishedMessage } from '../../shared/chat'
import { ChatMarkdown } from './markdown'
import { inlineImageType } from '../../shared/image'
import { ImagePreview } from './image-preview'
import { discordAttachmentUrl, publishedAttachments } from '../../shared/discord-attachments'
import { displayPublishedMessage, groupPublishedMessages, localOperatorPrompt } from './message-groups'
import { formatMessageTime } from './message-time'
import { TooltipHint } from '../components/ui/tooltip'
import { CopyMessage } from './copy-message'
import { publishedMarkdown } from './published-markdown'
import { HushAvatar } from './hush-avatar'
import { inlineAudioType } from '../../shared/audio'
import { AudioMessage } from './audio-message'
import { AttachmentRow } from './attachment-row'

export function attachmentUrl(threadId: string, messageId: string, id: string) { return `/api/chat/threads/${threadId}/messages/${messageId}/attachments/${id}` }
const componentSchema = z.looseObject({ type: z.number(), content: z.string().optional(), components: z.array(z.unknown()).optional(), accessory: z.unknown().optional(), accent_color: z.number().optional(), label: z.string().optional(), items: z.array(z.unknown()).optional(), media: z.unknown().optional(), file: z.unknown().optional() })
const mediaSchema = z.object({ url: z.string().nullish(), proxy_url: z.string().nullish(), attachment_id: z.string().nullish(), content_type: z.string().nullish() })
const embedSchema = z.object({ title: z.string().optional(), description: z.string().optional(), image: mediaSchema.optional(), thumbnail: mediaSchema.optional(), fields: z.array(z.object({ name: z.string(), value: z.string() })).optional() })
function ImageViewer({ src, name, opener, close }: { src: string; name: string; opener: HTMLElement; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => { dialog?.close(); if (opener.isConnected) opener.focus() } }, [opener])
  return <dialog className="chat-image-dialog" ref={ref} aria-label={name} onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (event.target === ref.current) close() }}><button autoFocus onClick={close}>Close image</button><ImagePreview key={src} src={src} name={name} /></dialog>
}
export function PublishedMessages({ messages, threadId, discordUrl, preview, forwardAudio, busy = false, stale = false }: { messages: PublishedMessage[]; threadId: string; discordUrl?: string; preview: (name: string, url: string) => void; forwardAudio?: (name: string, url: string) => void; busy?: boolean; stale?: boolean }) {
  const [image, setImage] = useState<{ src: string; name: string; opener: HTMLElement } | null>(null)
  function imageView(url: string, name: string, key: string, width?: number | null, height?: number | null): ReactNode {
    return <div key={key} className="chat-image"><button aria-label={`Enlarge ${name}`} onClick={event => setImage({ src: url, name, opener: event.currentTarget })}><ImagePreview key={url} src={url} name={name} lazy width={width} height={height} /></button><span>{name}<a href={url} download={name}>Download</a></span></div>
  }
  function fileView(message: PublishedMessage, file: PublishedMessage['attachments'][number]): ReactNode {
    const url = attachmentUrl(threadId, message.id, file.id)
    if (!(file.width && file.height) && inlineAudioType(file.filename, file.content_type)) return <AudioMessage key={file.id} src={url} name={file.filename} duration={typeof file.duration_secs === 'number' ? file.duration_secs : undefined} waveform={typeof file.waveform === 'string' ? file.waveform : undefined} forward={forwardAudio ? () => forwardAudio(file.filename, url) : undefined} />
    const html = /\.html?$/i.test(file.filename) || file.content_type?.split(';')[0].trim().toLowerCase() === 'text/html'
    return inlineImageType(file.filename, file.content_type) ? imageView(url, file.filename, file.id, file.width, file.height) : <AttachmentRow key={file.id} name={file.filename} size={file.size} url={url} preview={html ? () => preview(file.filename, url) : undefined} />
  }
  function mediaView(value: unknown, key: string, message: PublishedMessage, used: Set<string>, description?: string): ReactNode {
    const parsed = mediaSchema.safeParse(value)
    if (parsed.success) {
      const media = parsed.data, urls = [media.url, media.proxy_url].filter((url): url is string => Boolean(url))
      const ids = urls.map(url => discordAttachmentUrl(url)?.id).filter(Boolean)
      const file = message.attachments.find(file => file.id === media.attachment_id || ids.includes(file.id) || urls.some(url => file.url === url || file.proxy_url === url || `attachment://${file.filename}` === url))
      if (file) { if (used.has(file.id)) return null; used.add(file.id); return fileView(message, file) }
    }
    return <p key={key} className="chat-muted">{description || 'Media'}{discordUrl && <> · <a href={discordUrl}>View in Discord</a></>}</p>
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
        const parsed = z.object({ media: z.unknown(), description: z.string().nullish() }).safeParse(raw)
        return mediaView(parsed.success ? parsed.data.media : undefined, `${key}-${i}`, message, used, parsed.success ? parsed.data.description || undefined : undefined)
      })}</div>
    }
    return <div key={key} className="chat-action-unavailable"><span>{item.label || 'Discord interaction'}</span>{discordUrl ? <a href={discordUrl}>Respond in Discord</a> : <span>Not available in this client yet</span>}</div>
  }
  const groups = groupPublishedMessages(messages)
  return <>{groups.map((group, groupIndex) => {
    const first = group.messages[0], operator = localOperatorPrompt(first), author = operator ? 'You' : first.author.global_name || first.author.username, role = group.role === 'assistant' ? 'assistant' : 'user'
    return <section className={`chat-message-group ${role}`} key={group.id} aria-label={`Messages from ${author}`} data-message-group={group.id}>
    <div className="chat-avatar-rail" aria-hidden="true"><span className="chat-avatar">{role === 'assistant' ? <HushAvatar /> : author.slice(0, 1)}</span></div>
    <div className="chat-message-content"><div className="chat-message-meta"><strong>{author}</strong><TooltipHint label={new Date(first.timestamp).toLocaleString()}><time dateTime={first.timestamp}>{formatMessageTime(first.timestamp)}</time></TooltipHint>{operator?.queued && <small>Queued</small>}</div>
    {group.messages.map((raw, index) => { const message = { ...displayPublishedMessage(raw), attachments: publishedAttachments(raw) }, used = new Set<string>(); return <TooltipHint key={message.id} label={new Date(message.timestamp).toLocaleString()}><article className={`chat-message ${role}`} data-message-id={message.id}>
    {index > 0 && <time className="sr-only" dateTime={message.timestamp}>{new Date(message.timestamp).toLocaleString()}</time>}
    {message.content && <ChatMarkdown text={message.content} />}
    {message.components.map((item, i) => component(item, `${message.id}-${i}`, message, used))}
    {message.embeds.map((raw, i) => { const embed = embedSchema.safeParse(raw); return embed.success ? <div className="chat-container" key={i}>{embed.data.title && <strong>{embed.data.title}</strong>}{embed.data.description && <ChatMarkdown text={embed.data.description} />}{embed.data.fields?.map((field, n) => <div key={n}><strong>{field.name}</strong><ChatMarkdown text={field.value} /></div>)}{(embed.data.image || embed.data.thumbnail) && mediaView(embed.data.image || embed.data.thumbnail, `embed-${i}`, message, used)}</div> : null })}
    {message.attachments.some(file => !used.has(file.id)) && <div className="chat-attachments">{message.attachments.filter(file => !used.has(file.id)).map(file => fileView(message, file))}</div>}
    {message.edited_timestamp && <TooltipHint label={new Date(message.edited_timestamp).toLocaleString()}><small className="chat-message-edited">edited</small></TooltipHint>}
  </article></TooltipHint> })}{role === 'assistant' && !(groupIndex === groups.length - 1 && (busy || stale)) && <CopyMessage markdown={publishedMarkdown(group.messages)} />}</div></section> })}{image && <ImageViewer src={image.src} name={image.name} opener={image.opener} close={() => setImage(null)} />}</>
}
