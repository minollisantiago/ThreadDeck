// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Dashboard } from './App'
import { darkThemes, lightThemes } from './lib/theme'

afterEach(() => { cleanup(); localStorage.clear() })

it('offers four dark backgrounds, matching the number of light backgrounds', () => {
  localStorage.setItem('threaddeck:appearance', '"dark"')
  render(<Dashboard snapshot={null} />)
  expect(darkThemes).toHaveLength(4)
  expect(darkThemes).toHaveLength(lightThemes.length)
  expect(within(screen.getByRole('group', { name: 'Dark theme background' })).getAllByRole('button')).toHaveLength(4)
  for (const theme of darkThemes) {
    fireEvent.click(screen.getByRole('button', { name: `${theme.label} theme` }))
    expect(document.documentElement.dataset.darkTheme).toBe(theme.value)
    expect(JSON.parse(localStorage.getItem('threaddeck:dark-theme')!)).toBe(theme.value)
    expect(screen.getByRole('button', { name: `${theme.label} theme` }).getAttribute('aria-pressed')).toBe('true')
  }
})

it('remembers each mode independently without removing the four-slot picker', () => {
  localStorage.setItem('threaddeck:appearance', '"dark"')
  const view = render(<Dashboard snapshot={null} />)
  fireEvent.click(screen.getByRole('button', { name: 'Graphite theme' }))
  fireEvent.click(screen.getByRole('button', { name: 'blue accent' }))
  fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }))
  expect(within(screen.getByRole('group', { name: 'Light theme background' })).getAllByRole('button')).toHaveLength(4)
  fireEvent.click(screen.getByRole('button', { name: 'Warm paper theme' }))
  fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }))
  expect(screen.getByRole('button', { name: 'Graphite theme' }).getAttribute('aria-pressed')).toBe('true')
  expect(document.documentElement.dataset.palette).toBe('blue')
  view.unmount()
  render(<Dashboard snapshot={null} />)
  expect(document.documentElement.dataset.darkTheme).toBe('graphite')
  fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }))
  expect(document.documentElement.dataset.lightTheme).toBe('paper')
})

it('falls back to the original dark background for invalid saved settings', () => {
  localStorage.setItem('threaddeck:appearance', '"dark"')
  localStorage.setItem('threaddeck:dark-theme', '"not-a-theme"')
  render(<Dashboard snapshot={null} />)
  expect(document.documentElement.dataset.darkTheme).toBe('original')
  expect(screen.getByRole('button', { name: 'Original theme' }).getAttribute('aria-pressed')).toBe('true')
})
