// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ProposalCharacter, characterRotationMs } from './character'

let reduced = false
const motionListeners = new Set<() => void>()
beforeEach(() => {
  vi.useFakeTimers(); reduced = false; motionListeners.clear()
  vi.stubGlobal('matchMedia', vi.fn(() => ({ get matches() { return reduced }, addEventListener: (_event: string, listener: () => void) => motionListeners.add(listener), removeEventListener: (_event: string, listener: () => void) => motionListeners.delete(listener) })))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('rotates the four approved activities continuously, without the paperwork scene', () => {
  const { container, unmount } = render(<ProposalCharacter />)
  const scene = () => container.querySelector('.proposal-character')?.getAttribute('data-scene')
  expect(scene()).toBe('inspector')
  for (const expected of ['fishing', 'coffee', 'bugs', 'inspector', 'fishing']) {
    act(() => vi.advanceTimersByTime(characterRotationMs))
    expect(scene()).toBe(expected)
  }
  expect(container.querySelectorAll('.chat-hush-avatar')).toHaveLength(1)
  expect(container.querySelector('.proposal-character-art')?.getAttribute('aria-hidden')).toBe('true')
  unmount(); expect(vi.getTimerCount()).toBe(0); expect(motionListeners.size).toBe(0)
})
it('pauses both the animation and rotation until explicitly resumed', () => {
  const { container } = render(<ProposalCharacter />)
  fireEvent.click(screen.getByRole('button', { name: 'Pause character animation' }))
  act(() => vi.advanceTimersByTime(characterRotationMs * 4))
  expect(container.firstElementChild?.getAttribute('data-paused')).toBe('true')
  expect(container.firstElementChild?.getAttribute('data-scene')).toBe('inspector')
  fireEvent.click(screen.getByRole('button', { name: 'Play character animation' }))
  act(() => vi.advanceTimersByTime(characterRotationMs))
  expect(container.firstElementChild?.getAttribute('data-scene')).toBe('fishing')
})
it('stops for reduced motion, including when the preference changes at runtime', () => {
  reduced = true
  const { container } = render(<ProposalCharacter />)
  expect(screen.queryByRole('button')).toBeNull()
  act(() => vi.advanceTimersByTime(characterRotationMs * 2))
  expect(container.firstElementChild?.getAttribute('data-scene')).toBe('inspector')
  act(() => { reduced = false; motionListeners.forEach(listener => listener()) })
  act(() => vi.advanceTimersByTime(characterRotationMs))
  expect(container.firstElementChild?.getAttribute('data-scene')).toBe('fishing')
  act(() => { reduced = true; motionListeners.forEach(listener => listener()) })
  act(() => vi.advanceTimersByTime(characterRotationMs * 2))
  expect(container.firstElementChild?.getAttribute('data-scene')).toBe('fishing')
})
it('suspends rotation while the document is hidden and resumes when visible', () => {
  const { container } = render(<ProposalCharacter />)
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  fireEvent(document, new Event('visibilitychange'))
  act(() => vi.advanceTimersByTime(characterRotationMs * 3))
  expect(container.firstElementChild?.getAttribute('data-scene')).toBe('inspector')
  visibility.mockReturnValue('visible'); fireEvent(document, new Event('visibilitychange'))
  act(() => vi.advanceTimersByTime(characterRotationMs))
  expect(container.firstElementChild?.getAttribute('data-scene')).toBe('fishing')
})
