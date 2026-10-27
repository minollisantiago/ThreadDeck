import { useLayoutEffect, useRef, type RefObject } from 'react'

type Position = { x: number; y: number }
const easing = 'cubic-bezier(.22, 1, .36, 1)'

// FLIP stable thread IDs across sorting, filtering and state-group reparenting.
export function useThreadListMotion(ref: RefObject<HTMLElement | null>, value: string) {
  const previous = useRef<{ value: string; positions: Map<string, Position> } | null>(null)
  const populated = useRef(false), running = useRef(new Map<HTMLElement, Animation>())
  useLayoutEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const cancel = () => { for (const animation of running.current.values()) animation.cancel(); running.current.clear() }
    const change = () => { if (preference?.matches) cancel() }
    preference?.addEventListener('change', change)
    return () => { cancel(); preference?.removeEventListener('change', change) }
  }, [])
  useLayoutEffect(() => {
    const container = ref.current
    if (!container) return
    const changed = previous.current?.value !== value, from = new Map(previous.current?.positions)
    const translation = (node: HTMLElement) => {
      const transform = getComputedStyle(node).transform
      return transform && transform !== 'none' && typeof DOMMatrixReadOnly !== 'undefined' ? new DOMMatrixReadOnly(transform) : { m41: 0, m42: 0 }
    }
    if (changed) {
      for (const [node, animation] of running.current) {
        const id = node.dataset.sessionId, old = id ? from.get(id) : undefined
        if (old && node.isConnected) { const delta = translation(node); from.set(id!, { x: old.x + delta.m41, y: old.y + delta.m42 }) }
        animation.cancel()
      }
      running.current.clear()
    }
    const origin = container.getBoundingClientRect(), positions = new Map<string, Position>()
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    for (const node of container.querySelectorAll<HTMLElement>('[data-session-id]')) {
      const id = node.dataset.sessionId!, rect = node.getBoundingClientRect()
      if (!rect.width || !rect.height || getComputedStyle(node).visibility === 'hidden') continue
      const delta = running.current.has(node) ? translation(node) : { m41: 0, m42: 0 }
      const next = { x: rect.left - origin.left + container.scrollLeft - delta.m41, y: rect.top - origin.top + container.scrollTop - delta.m42 }
      positions.set(id, next)
      if (!changed || !populated.current || reduced || typeof node.animate !== 'function') continue
      const old = from.get(id), x = old ? old.x - next.x : 0, y = old ? old.y - next.y : 8
      if (old && Math.abs(x) < 1 && Math.abs(y) < 1) continue
      const animation = node.animate(old ? [{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }] : [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: old ? 260 : 180, easing })
      animation.id = old ? 'thread-list-move' : 'thread-list-enter'
      running.current.set(node, animation)
      animation.onfinish = () => { if (running.current.get(node) === animation) running.current.delete(node) }
    }
    previous.current = { value, positions }
    if (positions.size) populated.current = true
  })
}
