import { useLayoutEffect, useRef, useState } from 'react'
import { Clock3 } from 'lucide-react'
import { Button } from './ui/button'
import type { Filter } from '../lib/view'

const filters = [
  ['active', 'Active sessions', 'Active'], ['all', 'All sessions', 'All'],
  ['working', 'Working', 'Working'], ['attention', 'Attention', 'Attention'], ['recent', 'Recent activity', 'Recent'],
] as const

export function FilterTabs({ filter, setFilter }: { filter: Filter; setFilter: (value: Filter) => void }) {
  const group = useRef<HTMLDivElement>(null)
  const previous = useRef(filter)
  const [direction, setDirection] = useState<'left' | 'right' | 'none'>('none')
  const [indicator, setIndicator] = useState<{ x: number; y: number; width: number } | null>(null)
  useLayoutEffect(() => {
    if (previous.current !== filter) {
      const index = (value: Filter) => filters.findIndex(([key]) => key === value)
      setDirection(index(filter) > index(previous.current) ? 'right' : 'left')
      previous.current = filter
    }
    const element = group.current
    if (!element) return
    let cancelled = false
    const measure = () => {
      if (cancelled) return
      const labels = element.querySelectorAll<HTMLElement>('.filter-selected > span')
      const label = [...labels].find(item => item.getBoundingClientRect().width > 0)
      if (!label) return
      const bounds = element.getBoundingClientRect()
      const text = label.getBoundingClientRect()
      setIndicator({ x: text.left - bounds.left, y: text.bottom - bounds.top + 5, width: text.width })
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(element)
    window.addEventListener('resize', measure)
    void document.fonts?.ready.then(measure)
    return () => { cancelled = true; observer?.disconnect(); window.removeEventListener('resize', measure) }
  }, [filter])
  return <div className="session-filter-scroll">
    <div ref={group} className="filter-group session-filters" role="group" aria-label="Filter sessions" data-motion-direction={direction}>
      {filters.map(([value, label, shortLabel]) => <Button key={value} variant="ghost" className={filter === value ? 'filter-selected' : ''} aria-label={label} aria-pressed={filter === value} title={value === 'recent' ? 'Updated in the last 24 hours' : undefined} onClick={() => setFilter(value)}>{value === 'recent' && <Clock3 />}<span className="filter-label-full">{label}</span><span className="filter-label-short" aria-hidden="true">{shortLabel}</span></Button>)}
      {indicator && <span className="filter-indicator" aria-hidden="true" style={{ width: indicator.width, transform: `translate3d(${indicator.x}px, ${indicator.y}px, 0)` }} />}
    </div>
  </div>
}
