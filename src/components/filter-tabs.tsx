import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Clock3 } from 'lucide-react'
import { Button } from './ui/button'
import { TooltipHint } from './ui/tooltip'
import type { Filter } from '../lib/view'

const filters: readonly FilterTabOption<Filter>[] = [
  { value: 'active', label: 'Active sessions', shortLabel: 'Active' },
  { value: 'all', label: 'All sessions', shortLabel: 'All' },
  { value: 'working', label: 'Working' }, { value: 'attention', label: 'Attention' },
  { value: 'recent', label: 'Recent activity', shortLabel: 'Recent', icon: <Clock3 />, hint: 'Updated in the last 24 hours' },
]

export interface FilterTabOption<T extends string> { value: T; label: string; shortLabel?: string; icon?: ReactNode; hint?: ReactNode }

export function FilterTabs({ filter, setFilter }: { filter: Filter; setFilter: (value: Filter) => void }) {
  return <FilterTabGroup filter={filter} setFilter={setFilter} filters={filters} label="Filter sessions" />
}
export function FilterTabGroup<T extends string>({ filter, setFilter, filters, label }: { filter: T; setFilter: (value: T) => void; filters: readonly FilterTabOption<T>[]; label: string }) {
  const group = useRef<HTMLDivElement>(null)
  const previous = useRef(filter)
  const [direction, setDirection] = useState<'left' | 'right' | 'none'>('none')
  const [indicator, setIndicator] = useState<{ x: number; y: number; width: number } | null>(null)
  useLayoutEffect(() => {
    if (previous.current !== filter) {
      const index = (value: T) => filters.findIndex(option => option.value === value)
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
  }, [filter, filters])
  return <div className="session-filter-scroll">
    <div ref={group} className="filter-group session-filters" role="group" aria-label={label} data-motion-direction={direction}>
      {filters.map(({ value, label, shortLabel, icon, hint }) => <TooltipHint key={value} label={hint}><Button variant="ghost" className={filter === value ? 'filter-selected' : ''} aria-label={label} aria-pressed={filter === value} onClick={() => setFilter(value)}>{icon}<span className="filter-label-full">{label}</span><span className="filter-label-short" aria-hidden="true">{shortLabel || label}</span></Button></TooltipHint>)}
      {indicator && <span className="filter-indicator" aria-hidden="true" style={{ width: indicator.width, transform: `translate3d(${indicator.x}px, ${indicator.y}px, 0)` }} />}
    </div>
  </div>
}
