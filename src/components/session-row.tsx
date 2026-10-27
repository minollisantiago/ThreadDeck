import { useCallback, useRef, useState } from 'react'
import { CircleAlert, CirclePause, ExternalLink, LoaderCircle, ShieldQuestion, Users } from 'lucide-react'
import { discordLinks, isAttention, type Session } from '../../shared/model'
import { relativeTime } from '../lib/view'
import { useChangeMotion } from '../hooks/use-change-motion'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { TooltipHint } from './ui/tooltip'
import { SessionContextMenu } from './session-context-menu'
import { useSelectedSession, useSessionNavigation } from '../chat/navigation'

const labels = { working: 'Working', idle: 'Idle', error: 'Error', input: 'Input requested', permission: 'Permission needed' }

export function SessionRow({ session, verified, now, unread, markRead, graphical = false, projectName }: {
  session: Session; verified: boolean; now: number; unread: boolean; markRead: (session: Session) => void; graphical?: boolean; projectName?: string
}) {
  const openSession = useSessionNavigation()
  const selected = useSelectedSession() === session.id
  const row = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const closeMenu = useCallback((restoreFocus = false) => {
    setMenu(null)
    if (restoreFocus) row.current?.focus()
  }, [])
  const links = discordLinks(session)
  const status = verified ? session.status : 'unknown'
  const attention = verified && isAttention(session.status)
  const flags = useRef<HTMLDivElement>(null)
  useChangeMotion(flags, `${status}:${unread}:${unread ? session.responseAt ?? '' : ''}`, 120, 2)
  const Icon = status === 'working' ? LoaderCircle : status === 'idle' ? CirclePause : status === 'permission' ? ShieldQuestion : CircleAlert
  return <TooltipHint label={<div className="session-tooltip"><strong>{session.title}</strong><span>Updated {relativeTime(session.updatedAt, now)}</span><time dateTime={new Date(session.updatedAt).toISOString()}>{new Date(session.updatedAt).toLocaleString()}</time></div>}><div ref={row} tabIndex={0} aria-haspopup="menu" className={`session-row ${attention || unread ? 'session-attention' : ''} ${unread ? 'session-unread' : ''} ${graphical ? 'session-tile' : ''}`} data-state={status} data-selected={selected} onContextMenu={event => {
    event.preventDefault()
    event.stopPropagation()
    setMenu({ x: event.clientX, y: event.clientY })
  }} onKeyDown={event => {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      setMenu({ x: rect.left, y: rect.bottom })
    }
  }}>
    {(attention || unread) && <span className="session-attention-marker" aria-hidden="true" />}
    {graphical && <span className={`session-glyph glyph-${status}`} aria-hidden="true"><Icon /></span>}
    <div className="session-copy">
      {projectName && <span className="session-project"><span className="channel-hash" aria-hidden="true">#</span> {projectName}</span>}
      {links ? <a className="session-title" href={links.app} onClick={event => { if (openSession && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); openSession(session); return } markRead(session) }} onAuxClick={event => { if (event.button === 1) markRead(session) }}>{session.title}</a>
         : openSession ? <button className="session-title" onClick={() => openSession(session)}>{session.title}</button> : <span className="session-title">{session.title}</span>}
    </div>
    <div className="session-flags" ref={flags}>
      {unread && <TooltipHint label="Unread in ThreadDeck. Click to mark as read. Reading in Discord does not clear this flag."><button className="status status-unread" aria-label={`Mark ${session.title} as read`} onClick={() => markRead(session)}>Unread</button></TooltipHint>}
      {(!unread || status !== 'idle') && <TooltipHint label={verified && session.agentCount > 1 ? `${session.agentCount} agents` : undefined}><Badge className={`status status-${status}`}><span className="status-dot" />{status === 'unknown' ? 'Unknown' : labels[status]}</Badge></TooltipHint>}
    </div>
    {graphical && <div className="session-tile-meta"><span>Updated {relativeTime(session.updatedAt, now)}</span>{verified && session.agentCount > 0 && <span><Users aria-hidden="true" />{session.agentCount} {session.agentCount === 1 ? 'agent' : 'agents'}</span>}</div>}
    {links && <TooltipHint label="Open in Discord browser"><Button asChild variant="ghost" size="icon" className="browser-link"><a href={links.browser} target="_blank" rel="noreferrer" aria-label={`Open ${session.title} in browser`} onClick={() => markRead(session)} onAuxClick={event => { if (event.button === 1) markRead(session) }}><ExternalLink /></a></Button></TooltipHint>}
    {menu && <SessionContextMenu {...menu} unread={unread} markRead={() => markRead(session)} close={closeMenu} />}
  </div></TooltipHint>
}
