import { useEffect, useState, type CSSProperties } from 'react'
import { Check } from 'lucide-react'
import type { Session } from '../../shared/model'
import { TooltipHint } from './ui/tooltip'
import './session-unread-pill.css'

const freshDuration = 20_000

function FinishedRunway({ age }: { age: number }) {
  // CSS already advances with real time. Only seek on mount (or a new reply),
  // not on each dashboard clock tick, which would count elapsed time twice.
  const [initialAge] = useState(age)
  return <span className="finished-runway" aria-hidden="true" style={{ '--finished-age': `${-initialAge}ms` } as CSSProperties} />
}

export function SessionUnreadPill({ session, verified, now, markRead }: {
  session: Session; verified: boolean; now: number; markRead: (session: Session) => void
}) {
  const [expiredResponse, setExpiredResponse] = useState<number | null>(null)
  const responseAt = session.responseAt
  const age = responseAt == null ? freshDuration : now - responseAt
  const fresh = verified && session.status === 'idle' && session.agentCount === 0
    && responseAt != null && age >= 0 && age < freshDuration && expiredResponse !== responseAt

  useEffect(() => {
    if (!fresh || responseAt == null) return
    const timer = window.setTimeout(() => setExpiredResponse(responseAt), freshDuration - age)
    return () => window.clearTimeout(timer)
  }, [fresh, responseAt, age])

  return <TooltipHint label={`${fresh ? 'Just finished. Becomes unread after 20 seconds.' : 'Unread in ThreadDeck.'} Click to mark as read. Reading in Discord does not clear this flag.`}>
    <button className={`status status-unread${fresh ? ' status-just-finished' : ''}`} aria-label={`Mark ${session.title} as read`} onClick={() => markRead(session)}>
      {fresh && <Check className="finished-check" size={10} aria-hidden="true" />}
      {fresh ? 'Just finished' : 'Unread'}
      {fresh && <FinishedRunway key={responseAt} age={age} />}
    </button>
  </TooltipHint>
}
