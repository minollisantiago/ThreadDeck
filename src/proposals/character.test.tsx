// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ProposalCharacter } from './character'

const scenes = ['inspector', 'fishing', 'coffee', 'bugs']
const next = (scene: string | null | undefined) => scenes[(scenes.indexOf(scene || '') + 1) % scenes.length]

let reduced = false
const motionListeners = new Set<() => void>()
beforeEach(() => {
  vi.useFakeTimers(); reduced = false; motionListeners.clear()
  vi.stubGlobal('matchMedia', vi.fn(() => ({ get matches() { return reduced }, addEventListener: (_event: string, listener: () => void) => motionListeners.add(listener), removeEventListener: (_event: string, listener: () => void) => motionListeners.delete(listener) })))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('keeps one scene throughout an opening and selects the next only after reopening', () => {
  let previous: string | null | undefined
  for (let opening = 0; opening < 6; opening++) {
    const { container, rerender, unmount } = render(<ProposalCharacter />)
    const scene = container.firstElementChild?.getAttribute('data-scene')
    expect(scenes).toContain(scene)
    if (previous) expect(scene).toBe(next(previous))
    act(() => vi.advanceTimersByTime(120_000))
    rerender(<ProposalCharacter />)
    expect(container.firstElementChild?.getAttribute('data-scene')).toBe(scene)
    expect(container.querySelectorAll('.chat-hush-avatar')).toHaveLength(1)
    expect(container.querySelector('.proposal-character-art')?.getAttribute('aria-hidden')).toBe('true')
    previous = scene
    unmount(); expect(vi.getTimerCount()).toBe(0); expect(motionListeners.size).toBe(0)
  }
})
it('pauses and resumes animation without selecting another scene', () => {
  const { container } = render(<ProposalCharacter />)
  const scene = container.firstElementChild?.getAttribute('data-scene')
  fireEvent.click(screen.getByRole('button', { name: 'Pause character animation' }))
  act(() => vi.advanceTimersByTime(120_000))
  expect(container.firstElementChild?.getAttribute('data-paused')).toBe('true')
  expect(container.firstElementChild?.getAttribute('data-scene')).toBe(scene)
  fireEvent.click(screen.getByRole('button', { name: 'Play character animation' }))
  expect(container.firstElementChild?.getAttribute('data-paused')).toBe('false')
  expect(container.firstElementChild?.getAttribute('data-scene')).toBe(scene)
})
it('stops for reduced motion, including when the preference changes at runtime', () => {
  reduced = true
  const { container } = render(<ProposalCharacter />)
  const scene = container.firstElementChild?.getAttribute('data-scene')
  expect(screen.queryByRole('button')).toBeNull()
  act(() => vi.advanceTimersByTime(120_000))
  expect(container.firstElementChild?.getAttribute('data-scene')).toBe(scene)
  act(() => { reduced = false; motionListeners.forEach(listener => listener()) })
  expect(container.firstElementChild?.getAttribute('data-paused')).toBe('false')
  act(() => { reduced = true; motionListeners.forEach(listener => listener()) })
  expect(container.firstElementChild?.getAttribute('data-paused')).toBe('true')
  expect(container.firstElementChild?.getAttribute('data-scene')).toBe(scene)
})
it('suspends animation while hidden without changing scenes when visible again', () => {
  const { container } = render(<ProposalCharacter />)
  const scene = container.firstElementChild?.getAttribute('data-scene')
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  fireEvent(document, new Event('visibilitychange'))
  expect(container.firstElementChild?.getAttribute('data-paused')).toBe('true')
  visibility.mockReturnValue('visible'); fireEvent(document, new Event('visibilitychange'))
  expect(container.firstElementChild?.getAttribute('data-paused')).toBe('false')
  expect(container.firstElementChild?.getAttribute('data-scene')).toBe(scene)
})
it('advances once per opening even when Strict Mode replays effects', () => {
  const first = render(<StrictMode><ProposalCharacter /></StrictMode>)
  const scene = first.container.firstElementChild?.getAttribute('data-scene')
  first.unmount()
  const second = render(<StrictMode><ProposalCharacter /></StrictMode>)
  expect(second.container.firstElementChild?.getAttribute('data-scene')).toBe(next(scene))
})
