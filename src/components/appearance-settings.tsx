import { TooltipHint } from './ui/tooltip'
import { darkThemes, lightThemes, type DarkTheme, type LightTheme } from '../lib/theme'

export const palettes = ['pink', 'lavender', 'blue', 'green', 'peach'] as const
export type Palette = typeof palettes[number]
export interface AppearanceSettingsProps {
  appearance: 'dark' | 'light'; setAppearance: (value: 'dark' | 'light') => void
  palette: Palette; setPalette: (value: Palette) => void
  lightTheme: LightTheme; setLightTheme: (value: LightTheme) => void
  darkTheme: DarkTheme; setDarkTheme: (value: DarkTheme) => void
}

export function AppearanceSettings({ appearance, palette, setPalette, lightTheme, setLightTheme, darkTheme, setDarkTheme }: AppearanceSettingsProps) {
  const themeOptions = appearance === 'light'
    ? lightThemes.map(option => ({ ...option, selected: lightTheme === option.value, swatch: `theme-${option.value}`, select: () => setLightTheme(option.value) }))
    : darkThemes.map(option => ({ ...option, selected: darkTheme === option.value, swatch: `theme-dark-${option.value}`, select: () => setDarkTheme(option.value) }))
  return <>
    <p className="interface-field-label">Accent color</p><div className="palette-picker" role="group" aria-label="Accent color">{palettes.map(p => <TooltipHint key={p} label={`${p} accent`}><button className={`palette-swatch palette-${p}`} aria-label={`${p} accent`} aria-pressed={palette === p} onClick={() => setPalette(p)}>{palette === p ? '✓' : ''}</button></TooltipHint>)}</div>
    <p className="interface-field-label">Background</p><div className="theme-picker" role="group" aria-label={`${appearance === 'light' ? 'Light' : 'Dark'} theme background`}>{themeOptions.map(option => <TooltipHint key={option.value} label={`${option.label} theme`}><button className={`theme-swatch ${option.swatch}`} aria-label={`${option.label} theme`} aria-pressed={option.selected} onClick={option.select}>{option.selected ? '✓' : ''}</button></TooltipHint>)}</div>
  </>
}
