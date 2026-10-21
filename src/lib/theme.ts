export const lightThemes = [
  { value: 'original', label: 'Original' },
  { value: 'porcelain', label: 'Porcelain' },
  { value: 'paper', label: 'Warm paper' },
  { value: 'slate', label: 'Cool slate' },
] as const

export type LightTheme = typeof lightThemes[number]['value']
export function isLightTheme(value: unknown): value is LightTheme { return lightThemes.some(theme => theme.value === value) }

export const darkThemes = [
  { value: 'original', label: 'Original' },
  { value: 'charcoal', label: 'Charcoal' },
  { value: 'midnight', label: 'Midnight' },
  { value: 'graphite', label: 'Graphite' },
] as const

export type DarkTheme = typeof darkThemes[number]['value']
export function isDarkTheme(value: unknown): value is DarkTheme { return darkThemes.some(theme => theme.value === value) }
