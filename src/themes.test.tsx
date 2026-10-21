// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Dashboard } from './App'

afterEach(() => { cleanup(); localStorage.clear() })

it('offers background themes in light mode, independently of the accent, and restores the selection', () => {
  localStorage.setItem('threaddeck:appearance', JSON.stringify('light'))
  const view = render(<Dashboard snapshot={null} />)
  expect(screen.getByRole('button', { name: 'Original theme' }).getAttribute('aria-pressed')).toBe('true')
  for (const [label, value] of [['Porcelain', 'porcelain'], ['Warm paper', 'paper'], ['Cool slate', 'slate']]) {
    fireEvent.click(screen.getByRole('button', { name: `${label} theme` }))
    expect(document.documentElement.dataset.lightTheme).toBe(value)
    expect(screen.getByRole('button', { name: `${label} theme` }).getAttribute('aria-pressed')).toBe('true')
    expect(JSON.parse(localStorage.getItem('threaddeck:light-theme')!)).toBe(value)
  }
  fireEvent.click(screen.getByRole('button', { name: 'blue accent' }))
  expect(document.documentElement.dataset.lightTheme).toBe('slate')
  expect(document.documentElement.dataset.palette).toBe('blue')
  fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }))
  expect(screen.queryByRole('group', { name: 'Light theme background' })).toBeNull()
  view.unmount()
  render(<Dashboard snapshot={null} />)
  fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }))
  expect(screen.getByRole('button', { name: 'Cool slate theme' }).getAttribute('aria-pressed')).toBe('true')
  expect(document.documentElement.dataset.palette).toBe('blue')
})

it('falls back to the original theme for invalid saved values', () => {
  localStorage.setItem('threaddeck:appearance', JSON.stringify('light'))
  localStorage.setItem('threaddeck:light-theme', JSON.stringify('unknown'))
  render(<Dashboard snapshot={null} />)
  expect(document.documentElement.dataset.lightTheme).toBe('original')
  expect(screen.getByRole('button', { name: 'Original theme' }).getAttribute('aria-pressed')).toBe('true')
})
