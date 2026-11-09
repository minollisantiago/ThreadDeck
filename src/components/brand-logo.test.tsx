// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { BrandLogo } from './brand-logo'

afterEach(cleanup)

it('uses the exact approved three-layer mark across the app, favicon and launcher splash', () => {
  const path = 'm12 3 9 5-9 5-9-5 9-5Z M3 12l9 5 9-5 M3 16l9 5 9-5'
  const { container } = render(<BrandLogo size={25} aria-label="ThreadDeck" />)
  const logo = container.querySelector('svg')!
  expect(logo.getAttribute('viewBox')).toBe('0 0 24 24')
  expect(logo.getAttribute('width')).toBe('25')
  expect(logo.getAttribute('stroke')).toBe('currentColor')
  expect(logo.getAttribute('stroke-width')).toBe('1.6')
  expect(logo.querySelector('path')?.getAttribute('d')).toBe(path)
  for (const file of ['../assets/favicon.svg', '../../electron/startup.html']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    expect(source).toContain(`d="${path}"`)
  }
})
