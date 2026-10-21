// @vitest-environment jsdom
import { useRef } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { useChangeMotion } from './use-change-motion'

const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate')
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  if (originalAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate)
  else Reflect.deleteProperty(HTMLElement.prototype, 'animate')
})

function Surface({ value, tick = 0 }: { value: string; tick?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useChangeMotion(ref, value)
  return <div ref={ref}>{tick}</div>
}

function mockMotion(reduced = false) {
  const preference = Object.assign(new EventTarget(), { matches: reduced })
  vi.stubGlobal('matchMedia', () => preference)
  const cancel = vi.fn()
  const animate = vi.fn(() => ({ cancel }))
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate })
  return { preference, animate, cancel }
}

it('skips mounts and unchanged values, but animates a real change without remounting', () => {
  const { animate, cancel } = mockMotion()
  const { container, rerender, unmount } = render(<Surface value="project" />)
  const node = container.firstChild
  rerender(<Surface value="project" tick={1} />)
  expect(animate).not.toHaveBeenCalled()
  rerender(<Surface value="state" tick={2} />)
  expect(animate).toHaveBeenCalledTimes(1)
  expect(container.firstChild).toBe(node)
  rerender(<Surface value="islands" tick={3} />)
  expect(cancel).toHaveBeenCalledTimes(1)
  expect(animate).toHaveBeenCalledTimes(2)
  unmount()
  expect(cancel).toHaveBeenCalledTimes(2)
})

it('skips reduced motion and does not replay skipped changes when preference returns', () => {
  const { preference, animate } = mockMotion(true)
  const { rerender } = render(<Surface value="working" />)
  rerender(<Surface value="input" />)
  expect(animate).not.toHaveBeenCalled()
  preference.matches = false
  preference.dispatchEvent(new Event('change'))
  rerender(<Surface value="input" tick={1} />)
  expect(animate).not.toHaveBeenCalled()
  rerender(<Surface value="idle" />)
  expect(animate).toHaveBeenCalledTimes(1)
})

it('cancels an active JS animation when reduced motion is enabled', () => {
  const { preference, cancel } = mockMotion()
  const { rerender } = render(<Surface value="working" />)
  rerender(<Surface value="input" />)
  preference.matches = true
  preference.dispatchEvent(new Event('change'))
  expect(cancel).toHaveBeenCalledTimes(1)
})
