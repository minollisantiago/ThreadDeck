import type { ReactNode, Ref } from 'react'
import { List, Moon, Network, Sun } from 'lucide-react'
import { Button } from './ui/button'
import { TooltipHint } from './ui/tooltip'
import type { Design } from '../lib/design'
import { darkThemes, lightThemes, type DarkTheme, type LightTheme } from '../lib/theme'

export const palettes = ['pink', 'lavender', 'blue', 'green', 'peach'] as const
export type Palette = typeof palettes[number]
export interface AppearanceSettingsProps {
  appearance: 'dark' | 'light'; setAppearance: (value: 'dark' | 'light') => void
  palette: Palette; setPalette: (value: Palette) => void
  lightTheme: LightTheme; setLightTheme: (value: LightTheme) => void
  darkTheme: DarkTheme; setDarkTheme: (value: DarkTheme) => void
  design: Design; setDesign: (value: Design) => void
}

// Appearance stays in the header; profile preferences do not duplicate it.
export function AppearanceSettings({ appearance, palette, setAppearance, setPalette, lightTheme, setLightTheme, darkTheme, setDarkTheme, design, setDesign, themeButtonRef, children }: AppearanceSettingsProps & { themeButtonRef?: Ref<HTMLButtonElement>; children?: ReactNode }) {
  const themeOptions = appearance === 'light'
    ? lightThemes.map(option => ({ ...option, selected: lightTheme === option.value, swatch: `theme-${option.value}`, select: () => setLightTheme(option.value) }))
    : darkThemes.map(option => ({ ...option, selected: darkTheme === option.value, swatch: `theme-dark-${option.value}`, select: () => setDarkTheme(option.value) }))
  return <>
    <div className="palette-picker" role="group" aria-label="Accent color">{palettes.map(p => <TooltipHint key={p} label={`${p} accent`}><button className={`palette-swatch palette-${p}`} aria-label={`${p} accent`} aria-pressed={palette === p} onClick={() => setPalette(p)}>{palette === p ? '✓' : ''}</button></TooltipHint>)}</div>
    <div className="theme-picker" role="group" aria-label={`${appearance === 'light' ? 'Light' : 'Dark'} theme background`}>{themeOptions.map(option => <TooltipHint key={option.value} label={`${option.label} theme`}><button className={`theme-swatch ${option.swatch}`} aria-label={`${option.label} theme`} aria-pressed={option.selected} onClick={option.select}>{option.selected ? '✓' : ''}</button></TooltipHint>)}</div>
    <div className="header-actions">
      <TooltipHint label={`Switch to ${design === 'classic' ? 'islands' : 'list'} view`}><Button variant="outline" size="icon" aria-label={`Switch to ${design === 'classic' ? 'islands' : 'list'} view`} onClick={() => setDesign(design === 'classic' ? 'islands' : 'classic')}>{design === 'classic' ? <Network aria-hidden="true" /> : <List aria-hidden="true" />}</Button></TooltipHint>
      <Button ref={themeButtonRef} variant="outline" size="icon" aria-label={`Switch to ${appearance === 'dark' ? 'light' : 'dark'} mode`} onClick={() => setAppearance(appearance === 'dark' ? 'light' : 'dark')}>{appearance === 'dark' ? <Sun /> : <Moon />}</Button>
      {children}
    </div>
  </>
}
