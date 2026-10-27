// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useThreadListMotion } from './use-thread-list-motion'

afterEach(() => { cleanup(); document.body.replaceChildren(); vi.unstubAllGlobals() })
function fixture(reduced = false) {
  const container = document.createElement('div'), positions = new Map<string, number>(), calls: { id: string; frames: unknown; cancel: ReturnType<typeof vi.fn> }[] = []
  const listeners = new Set<() => void>(), preference = { matches: reduced, addEventListener: (_: string, listener: () => void) => listeners.add(listener), removeEventListener: (_: string, listener: () => void) => listeners.delete(listener) }
  vi.stubGlobal('matchMedia', () => preference)
  document.body.append(container)
  const add = (id: string, y: number) => {
    positions.set(id, y)
    const row = document.createElement('div'); row.dataset.sessionId = id
    row.getBoundingClientRect = () => new DOMRect(0, positions.get(id)!, 200, 40)
    Object.defineProperty(row, 'animate', { value: (frames: unknown) => { const cancel = vi.fn(); calls.push({ id, frames, cancel }); return { id: '', cancel, onfinish: null } } })
    container.append(row)
    return row
  }
  return { ref: { current: container }, add, positions, calls, preference, listeners }
}
it('animates reordered rows from their previous positions, not initial loads or unchanged refreshes', () => {
  const f = fixture(); f.add('a', 0); f.add('b', 50)
  const hook = renderHook(({ value }) => useThreadListMotion(f.ref, value), { initialProps: { value: 'a,b' } })
  expect(f.calls).toHaveLength(0)
  hook.rerender({ value: 'a,b' }); expect(f.calls).toHaveLength(0)
  f.positions.set('a', 50); f.positions.set('b', 0)
  hook.rerender({ value: 'b,a' })
  expect(f.calls.map(call => call.frames)).toEqual([
    [{ transform: 'translate(0px, -50px)' }, { transform: 'translate(0, 0)' }],
    [{ transform: 'translate(0px, 50px)' }, { transform: 'translate(0, 0)' }],
  ])
  hook.rerender({ value: 'b,a' }); expect(f.calls).toHaveLength(2)
  hook.unmount(); expect(f.calls.every(call => call.cancel.mock.calls.length > 0)).toBe(true)
})
it('fades new rows in and preserves movement across group reparenting with the same thread ID', () => {
  const f = fixture(), first = f.add('a', 0)
  const hook = renderHook(({ value }) => useThreadListMotion(f.ref, value), { initialProps: { value: 'a' } })
  f.add('b', 50); hook.rerender({ value: 'a,b' })
  expect(f.calls[0].frames).toEqual([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }])
  first.remove(); f.add('a', 100); hook.rerender({ value: 'group-b:b;group-a:a' })
  expect(f.calls.find(call => call.id === 'a')?.frames).toEqual([{ transform: 'translate(0px, -100px)' }, { transform: 'translate(0, 0)' }])
})
it('respects reduced motion and cancels active movement when the preference changes', () => {
  const f = fixture(); f.add('a', 0)
  const hook = renderHook(({ value }) => useThreadListMotion(f.ref, value), { initialProps: { value: 'a' } })
  f.add('b', 50); hook.rerender({ value: 'a,b' })
  expect(f.calls).toHaveLength(1)
  f.preference.matches = true; f.listeners.forEach(listener => listener())
  expect(f.calls[0].cancel).toHaveBeenCalled()
  f.add('c', 100); hook.rerender({ value: 'a,b,c' })
  expect(f.calls).toHaveLength(1)
})
