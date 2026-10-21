export const lightThemes = [
  { value: 'original', label: 'Original' },
  { value: 'porcelain', label: 'Porcelain' },
  { value: 'paper', label: 'Warm paper' },
  { value: 'slate', label: 'Cool slate' },
] as const

export type LightTheme = typeof lightThemes[number]['value']
export function isLightTheme(value: unknown): value is LightTheme { return lightThemes.some(theme => theme.value === value) }
