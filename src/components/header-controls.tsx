import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Github, List, Menu, Moon, Network, Sun } from 'lucide-react'
import { Button } from './ui/button'
import type { Design } from '../lib/design'

export const palettes = ['pink', 'lavender', 'blue', 'green', 'peach'] as const
export type Palette = typeof palettes[number]

export function HeaderControls({ appearance, palette, setAppearance, setPalette, design, setDesign, connection }: {
  appearance: 'dark' | 'light'; palette: Palette
  setAppearance: (value: 'dark' | 'light') => void; setPalette: (value: Palette) => void
  design: Design; setDesign: (value: Design) => void
  connection: ReactNode
}) {
  const controls = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const theme = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  useLayoutEffect(() => {
    const media = window.matchMedia?.('(max-width: 600px)')
    const panel = controls.current
    if (!media || !panel) return
    const sync = () => {
      const focused = panel.contains(document.activeElement)
      if (panel.matches(':popover-open')) panel.hidePopover()
      setOpen(false)
      if (media.matches) {
        panel.setAttribute('popover', 'auto')
        if (focused) trigger.current?.focus()
      } else {
        panel.removeAttribute('popover')
        if (focused || document.activeElement === trigger.current) theme.current?.focus()
      }
    }
    function toggle(event: ToggleEvent) { setOpen(event.newState === 'open') }
    panel.addEventListener('toggle', toggle)
    media.addEventListener('change', sync)
    sync()
    return () => { panel.removeEventListener('toggle', toggle); media.removeEventListener('change', sync) }
  }, [])
  return <>
    <Button ref={trigger} variant="outline" size="icon" className="mobile-menu-toggle" popoverTarget="header-controls" aria-label="App controls" aria-controls="header-controls" aria-expanded={open}><Menu aria-hidden="true" /></Button>
    <div ref={controls} className="appearance-controls" id="header-controls" role="group" aria-label="Appearance and links">
      <div className="palette-picker" role="group" aria-label="Accent color">{palettes.map(p => <button key={p} className={`palette-swatch palette-${p}`} aria-label={`${p} accent`} title={`${p} accent`} aria-pressed={palette === p} onClick={() => setPalette(p)}>{palette === p ? '✓' : ''}</button>)}</div>
      <div className="header-actions">
      <Button variant="outline" size="icon" aria-label={`Switch to ${design === 'classic' ? 'islands' : 'list'} view`} title={`Switch to ${design === 'classic' ? 'islands' : 'list'} view`} onClick={() => setDesign(design === 'classic' ? 'islands' : 'classic')}>{design === 'classic' ? <Network aria-hidden="true" /> : <List aria-hidden="true" />}</Button>
      <Button ref={theme} variant="outline" size="icon" aria-label={`Switch to ${appearance === 'dark' ? 'light' : 'dark'} mode`} onClick={() => setAppearance(appearance === 'dark' ? 'light' : 'dark')}>{appearance === 'dark' ? <Sun /> : <Moon />}</Button>
      <Button asChild variant="outline" size="icon"><a href="https://github.com/minollisantiago/ThreadDeck" target="_blank" rel="noopener noreferrer" aria-label="ThreadDeck on GitHub" title="View ThreadDeck on GitHub"><Github aria-hidden="true" /></a></Button>
      {connection}
      </div>
    </div>
  </>
}
