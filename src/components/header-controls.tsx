import { useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Github, Keyboard, Settings2, Sun } from 'lucide-react'
import { Button } from './ui/button'
import { TooltipHint } from './ui/tooltip'
import type { Design } from '../lib/design'
import { type DarkTheme, type LightTheme } from '../lib/theme'
import { WorkspaceControls } from '../chat/navigation'
import { KeyboardShortcuts } from './keyboard-shortcuts'

import { AppearanceSettings, type Palette } from './appearance-settings'
export { palettes, type Palette } from './appearance-settings'

export function HeaderControls({ appearance, palette, setAppearance, setPalette, lightTheme, setLightTheme, darkTheme, setDarkTheme, design, setDesign, connection, compact = false, rail = false }: {
  rail?: boolean
  compact?: boolean
  appearance: 'dark' | 'light'; palette: Palette
  setAppearance: (value: 'dark' | 'light') => void; setPalette: (value: Palette) => void
  design: Design; setDesign: (value: Design) => void
  lightTheme: LightTheme; setLightTheme: (value: LightTheme) => void
  darkTheme: DarkTheme; setDarkTheme: (value: DarkTheme) => void
  connection: ReactNode
}) {
  const controls = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const theme = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const shortcuts = useRef<HTMLButtonElement>(null)
  const restoreTo = useRef<HTMLButtonElement | null>(null)
  const workspace = useContext(WorkspaceControls)
  const restoreFocus = useCallback(() => restoreTo.current?.focus(), [])
  useLayoutEffect(() => {
    const media = window.matchMedia?.('(max-width: 600px)')
    const panel = controls.current
    if (!media || !panel) return
    const sync = () => {
      const focused = panel.contains(document.activeElement)
      if (panel.matches(':popover-open')) panel.hidePopover()
      setOpen(false)
      if (compact || media.matches) {
        panel.setAttribute('popover', 'auto')
        if (focused) trigger.current?.focus()
      } else {
        panel.removeAttribute('popover')
        if (focused || document.activeElement === trigger.current) theme.current?.focus()
      }
    }
    function toggle(event: ToggleEvent) { setOpen(event.newState === 'open') }
    const position = () => {
      if (!compact || !trigger.current) return
      const rect = trigger.current.getBoundingClientRect()
      panel.style.left = `${rail ? rect.right + 14 : Math.max(16, rect.right - Math.min(340, rect.right - 16))}px`
      panel.style.top = rail ? 'auto' : `${rect.bottom + 8}px`
      panel.style.bottom = rail ? `${Math.max(16, window.innerHeight - rect.bottom)}px` : 'auto'
    }
    const beforeToggle = (event: ToggleEvent) => { if (event.newState === 'open') position() }
    panel.addEventListener('beforetoggle', beforeToggle)
    panel.addEventListener('toggle', toggle)
    media.addEventListener('change', sync)
    sync()
    return () => { panel.removeEventListener('beforetoggle', beforeToggle); panel.removeEventListener('toggle', toggle); media.removeEventListener('change', sync) }
  }, [compact, rail])
  return <div className="header-controls">
    <TooltipHint label={rail ? 'Theme settings' : undefined}><Button ref={trigger} variant="ghost" size="icon" className="mobile-menu-toggle" popoverTarget="header-controls" aria-label={rail ? 'Theme settings' : 'App controls'} aria-controls="header-controls" aria-expanded={open}>{rail ? <Sun aria-hidden="true" /> : <Settings2 aria-hidden="true" />}</Button></TooltipHint>
    <div ref={controls} className="appearance-controls" id="header-controls" role="group" aria-label="Appearance and links">
      <AppearanceSettings appearance={appearance} palette={palette} setAppearance={setAppearance} setPalette={setPalette} lightTheme={lightTheme} setLightTheme={setLightTheme} darkTheme={darkTheme} setDarkTheme={setDarkTheme} design={design} setDesign={setDesign} themeButtonRef={theme}>
       <TooltipHint label="View ThreadDeck on GitHub"><Button asChild variant="outline" size="icon"><a href="https://github.com/minollisantiago/ThreadDeck" data-chat-external target="_blank" rel="noopener noreferrer" aria-label="ThreadDeck on GitHub"><Github aria-hidden="true" /></a></Button></TooltipHint>
       <TooltipHint label="Keyboard shortcuts"><Button ref={shortcuts} variant="outline" size="icon" aria-label="Keyboard shortcuts" aria-haspopup="dialog" onClick={() => {
         const popover = controls.current?.matches(':popover-open')
         restoreTo.current = popover ? trigger.current : shortcuts.current
         if (popover) controls.current?.hidePopover()
         setShortcutsOpen(true)
       }}><Keyboard aria-hidden="true" /></Button></TooltipHint>
      </AppearanceSettings>
    </div>
     {!compact && connection}
     {shortcutsOpen && <KeyboardShortcuts workspace={Boolean(workspace)} threadId={workspace?.threadId} close={() => setShortcutsOpen(false)} restoreFocus={restoreFocus} />}
  </div>
}
