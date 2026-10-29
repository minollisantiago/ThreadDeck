import { AlertCircle, Check, Download, Eye, File, FileArchive, FileCode2, FileSpreadsheet, FileText, X } from 'lucide-react'
import { Button } from '../components/ui/button'
import { TooltipHint } from '../components/ui/tooltip'
import './attachment-row.css'

export function attachmentSize(size?: number) {
  if (size === undefined || !Number.isFinite(size) || size < 0) return '—'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KiB`
  return `${(size / (1024 * 1024)).toFixed(1)} MiB`
}

export function AttachmentRow({ name, size, url, preview, remove, disabled = false, available = true }: {
  name: string; size?: number; url?: string; preview?: () => void; remove?: () => void; disabled?: boolean; available?: boolean
}) {
  const extension = name.split('.').pop()?.toLowerCase()
  const Icon = preview || extension === 'html' || extension === 'htm' ? FileCode2
    : ['zip', 'tar', 'gz', '7z', 'rar'].includes(extension || '') ? FileArchive
      : ['csv', 'tsv', 'xls', 'xlsx'].includes(extension || '') ? FileSpreadsheet
        : ['pdf', 'txt', 'md', 'json', 'yaml', 'yml', 'log'].includes(extension || '') ? FileText : File
  return <span className="chat-attachment-row" role="group" aria-label={name} data-unavailable={!available}>
    <Icon className="chat-attachment-icon" size={17} aria-hidden="true" />
    <TooltipHint label={name}><span className="chat-attachment-name" tabIndex={0}>{name}</span></TooltipHint>
    <span className="chat-attachment-size">{attachmentSize(size)}</span>
    <span className="chat-attachment-actions">
      {preview && <TooltipHint label="Preview HTML"><Button variant="ghost" size="icon" aria-label="Preview HTML" onClick={preview}><Eye aria-hidden="true" /></Button></TooltipHint>}
      {url && <TooltipHint label="Download file"><Button asChild variant="ghost" size="icon"><a href={url} download={name} aria-label={`Download ${name}`}><Download aria-hidden="true" /></a></Button></TooltipHint>}
      {remove && <><TooltipHint label={available ? 'Ready to send' : 'Reattach this file after reload'}><span className="chat-attachment-readiness" role="img" aria-label={available ? 'Ready to send' : 'Reattach this file after reload'} tabIndex={available ? undefined : 0}>{available ? <Check size={14} aria-hidden="true" /> : <AlertCircle size={15} aria-hidden="true" />}</span></TooltipHint><TooltipHint label="Remove attachment"><span className="chat-attachment-remove"><Button variant="ghost" size="icon" aria-label={`Remove ${name}`} disabled={disabled} onClick={remove}><X aria-hidden="true" /></Button></span></TooltipHint></>}
    </span>
  </span>
}
