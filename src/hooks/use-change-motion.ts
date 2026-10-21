import { useLayoutEffect, useRef, type RefObject } from 'react'

// Animate semantic changes, never initial mounts, clock ticks or fresh snapshot objects.
export function useChangeMotion(ref: RefObject<HTMLElement | null>, value: string, duration = 180, distance = 4) {
  const previous = useRef(value)
  useLayoutEffect(() => {
    if (previous.current === value) return
    previous.current = value
    const element = ref.current
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!element || typeof element.animate !== 'function' || preference?.matches) return
    const animation = element.animate([
      { opacity: .65, transform: `translateY(${distance}px)` },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration, easing: 'cubic-bezier(.22, 1, .36, 1)' })
    const stop = () => { if (preference?.matches) animation.cancel() }
    preference?.addEventListener('change', stop)
    return () => { animation.cancel(); preference?.removeEventListener('change', stop) }
  }, [ref, value, duration, distance])
}
