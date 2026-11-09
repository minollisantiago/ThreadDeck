import { useCallback, useContext, useId, useRef, useState } from 'react'
import { Github, Keyboard, Moon, Settings, Sun, X } from 'lucide-react'
import { Button } from './ui/button'
import { TooltipHint } from './ui/tooltip'
import { WorkspaceControls } from '../chat/navigation'
import { KeyboardShortcuts } from './keyboard-shortcuts'
import { AppearanceSettings, type AppearanceSettingsProps } from './appearance-settings'
import { NotificationSettings } from './notification-settings'
import { useDockPopover } from '../hooks/use-dock-popover'
export { palettes, type Palette } from './appearance-settings'

export function HeaderControls(props: AppearanceSettingsProps) {
  const controls = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), closeButton = useRef<HTMLButtonElement>(null)
  const { open, close } = useDockPopover({ trigger, panel: controls, align: 'right', width: 380, focus: closeButton })
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const workspace = useContext(WorkspaceControls)
  const restoreFocus = useCallback(() => trigger.current?.focus(), [])
  const id = useId(), title = useId(), interfaceTitle = useId(), notificationsTitle = useId()
  return <div className="header-controls">
    <TooltipHint label={`Switch to ${props.appearance === 'dark' ? 'light' : 'dark'} mode`}><Button variant="ghost" size="icon" className="dock-theme-toggle" aria-label={`Switch to ${props.appearance === 'dark' ? 'light' : 'dark'} mode`} onClick={() => props.setAppearance(props.appearance === 'dark' ? 'light' : 'dark')}>{props.appearance === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}</Button></TooltipHint>
    <TooltipHint label="Customize interface"><Button ref={trigger} variant="ghost" size="icon" className="mobile-menu-toggle" popoverTarget={id} aria-label="App controls" aria-controls={id} aria-expanded={open}><Settings aria-hidden="true" /></Button></TooltipHint>
    <div ref={controls} className="profile-popup interface-popup" id={id} popover="auto" role="dialog" aria-labelledby={title} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() } }}>
      <div className="profile-popup-heading"><Settings size={17} aria-hidden="true" /><h2 id={title}>Interface & notifications</h2><button ref={closeButton} className="profile-icon-button" aria-label="Close interface popup" onClick={close}><X /></button></div>
      <div className="profile-popup-body">
        <section className="profile-section" aria-labelledby={interfaceTitle}><h3 id={interfaceTitle}>Interface</h3><AppearanceSettings {...props} /></section>
        <section className="profile-section" aria-labelledby={notificationsTitle}><h3 id={notificationsTitle}>Notifications</h3><NotificationSettings /></section>
        <div className="header-actions interface-links">
          <TooltipHint label="View ThreadDeck on GitHub"><Button asChild variant="ghost"><a href="https://github.com/minollisantiago/ThreadDeck" data-chat-external target="_blank" rel="noopener noreferrer" aria-label="ThreadDeck on GitHub"><Github aria-hidden="true" />GitHub</a></Button></TooltipHint>
          <TooltipHint label="Keyboard shortcuts"><Button variant="ghost" aria-label="Keyboard shortcuts" aria-haspopup="dialog" onClick={() => { controls.current?.hidePopover(); setShortcutsOpen(true) }}><Keyboard aria-hidden="true" />Keyboard shortcuts</Button></TooltipHint>
        </div>
      </div>
    </div>
    {shortcutsOpen && <KeyboardShortcuts workspace={Boolean(workspace)} threadId={workspace?.threadId} close={() => setShortcutsOpen(false)} restoreFocus={restoreFocus} />}
  </div>
}
