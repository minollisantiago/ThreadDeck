export const designs = [
  { value: 'classic', label: 'Classic list' },
  { value: 'islands', label: 'Project islands' },
] as const

export type Design = typeof designs[number]['value']
export function isDesign(value: unknown): value is Design { return designs.some(design => design.value === value) }
