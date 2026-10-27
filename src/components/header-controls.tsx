import { useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Github, Keyboard, List, Moon, Network, Settings2, Sun } from 'lucide-react'
import { Button } from './ui/button'
import type { Design } from '../lib/design'
import { darkThemes, lightThemes, type DarkTheme, type LightTheme } from '../lib/theme'
import { WorkspaceControls } from '../chat/navigation'
import { KeyboardShortcuts } from './keyboard-shortcuts'

export const palettes = ['pink', 'lavender', 'blue', 'green', 'peach'] as const
export type Palette = typeof palettes[number]

export function HeaderControls({ appearance, palette, setAppearance, setPalette, lightTheme, setLightTheme, darkTheme, setDarkTheme, design, setDesign, connection, compact = false }: {
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
  const themeOptions = appearance === 'light'
    ? lightThemes.map(option => ({ ...option, selected: lightTheme === option.value, swatch: `theme-${option.value}`, select: () => setLightTheme(option.value) }))
    : darkThemes.map(option => ({ ...option, selected: darkTheme === option.value, swatch: `theme-dark-${option.value}`, select: () => setDarkTheme(option.value) }))
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
      panel.style.left = `${Math.max(16, rect.right - Math.min(340, rect.right - 16))}px`
      panel.style.top = `${rect.bottom + 8}px`
    }
    const beforeToggle = (event: ToggleEvent) => { if (event.newState === 'open') position() }
    panel.addEventListener('beforetoggle', beforeToggle)
    panel.addEventListener('toggle', toggle)
    media.addEventListener('change', sync)
    sync()
    return () => { panel.removeEventListener('beforetoggle', beforeToggle); panel.removeEventListener('toggle', toggle); media.removeEventListener('change', sync) }
  }, [compact])
  return <div className="header-controls">
    <Button ref={trigger} variant="ghost" size="icon" className="mobile-menu-toggle" popoverTarget="header-controls" aria-label="App controls" aria-controls="header-controls" aria-expanded={open}><Settings2 aria-hidden="true" /></Button>
    <div ref={controls} className="appearance-controls" id="header-controls" role="group" aria-label="Appearance and links">
      <div className="palette-picker" role="group" aria-label="Accent color">{palettes.map(p => <button key={p} className={`palette-swatch palette-${p}`} aria-label={`${p} accent`} title={`${p} accent`} aria-pressed={palette === p} onClick={() => setPalette(p)}>{palette === p ? '✓' : ''}</button>)}</div>
      <div className="theme-picker" role="group" aria-label={`${appearance === 'light' ? 'Light' : 'Dark'} theme background`}>{themeOptions.map(option => <button key={option.value} className={`theme-swatch ${option.swatch}`} aria-label={`${option.label} theme`} title={`${option.label} theme`} aria-pressed={option.selected} onClick={option.select}>{option.selected ? '✓' : ''}</button>)}</div>
      <div className="header-actions">
      <Button variant="outline" size="icon" aria-label={`Switch to ${design === 'classic' ? 'islands' : 'list'} view`} title={`Switch to ${design === 'classic' ? 'islands' : 'list'} view`} onClick={() => setDesign(design === 'classic' ? 'islands' : 'classic')}>{design === 'classic' ? <Network aria-hidden="true" /> : <List aria-hidden="true" />}</Button>
       <Button ref={theme} variant="outline" size="icon" aria-label={`Switch to ${appearance === 'dark' ? 'light' : 'dark'} mode`} onClick={() => setAppearance(appearance === 'dark' ? 'light' : 'dark')}>{appearance === 'dark' ? <Sun /> : <Moon />}</Button>
       <Button asChild variant="outline" size="icon"><a href="https://github.com/minollisantiago/ThreadDeck" target="_blank" rel="noopener noreferrer" aria-label="ThreadDeck on GitHub" title="View ThreadDeck on GitHub"><Github aria-hidden="true" /></a></Button>
       <Button ref={shortcuts} variant="outline" size="icon" aria-label="Keyboard shortcuts" title="Keyboard shortcuts" aria-haspopup="dialog" onClick={() => {
         const popover = controls.current?.matches(':popover-open')
         restoreTo.current = popover ? trigger.current : shortcuts.current
         if (popover) controls.current?.hidePopover()
         setShortcutsOpen(true)
       }}><Keyboard aria-hidden="true" /></Button>
      </div>
    </div>
     {!compact && connection}
     {shortcutsOpen && <KeyboardShortcuts workspace={Boolean(workspace)} threadId={workspace?.threadId} close={() => setShortcutsOpen(false)} restoreFocus={restoreFocus} />}
  </div>
}
