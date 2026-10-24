import { useEffect, useState } from 'react'
import { Layers2, Maximize2, Minimize2, Minus, X } from 'lucide-react'

declare global {
  interface Window {
    threaddeckDesktop?: {
      control: (action: 'minimize' | 'maximize' | 'close') => void
      onMaximized: (callback: (maximized: boolean) => void) => () => void
      botMode?: () => Promise<'fork' | 'regular' | null>
      onBotMode?: (callback: (mode: 'fork' | 'regular' | null) => void) => () => void
    }
  }
}

export function DesktopTitlebar() {
  const [maximized, setMaximized] = useState(false)
  const [botMode, setBotMode] = useState<'fork' | 'regular' | null>(null)
  const desktop = window.threaddeckDesktop
  useEffect(() => desktop?.onMaximized(setMaximized), [desktop])
  useEffect(() => {
    let active = true
    let notified = false
    const update = (mode: 'fork' | 'regular' | null) => { if (active) setBotMode(mode) }
    const unsubscribe = desktop?.onBotMode?.(mode => { notified = true; update(mode) })
    void desktop?.botMode?.().then(mode => { if (!notified) update(mode) }).catch(() => {})
    return () => { active = false; unsubscribe?.() }
  }, [desktop])
  if (!desktop) return null
  return <div className="desktop-titlebar">
    <div className="desktop-drag"><Layers2 aria-hidden="true" /><span>ThreadDeck</span><span className={`desktop-local ${botMode === 'regular' ? 'desktop-chat-off' : ''}`} role={botMode === 'regular' ? 'status' : undefined} title={botMode === 'regular' ? 'Running regular Kimaki—desktop chat unavailable. Discord and session management remain available; drafts are safe.' : undefined}>{botMode === 'regular' ? 'REGULAR · CHAT OFF' : 'LOCAL'}</span></div>
    <div className="desktop-window-controls">
      <button aria-label="Minimize window" title="Minimize" onClick={() => desktop.control('minimize')}><Minus /></button>
      <button aria-label={maximized ? 'Restore narrow window' : 'Maximize window'} title={maximized ? 'Restore narrow window' : 'Maximize'} onClick={() => desktop.control('maximize')}>{maximized ? <Minimize2 /> : <Maximize2 />}</button>
      <button aria-label="Close window" title="Close" onClick={() => desktop.control('close')}><X /></button>
    </div>
  </div>
}
