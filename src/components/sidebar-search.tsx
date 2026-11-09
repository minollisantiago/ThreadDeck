import type { RefObject } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from './ui/input'
import { TooltipHint } from './ui/tooltip'
import { Kbd } from './ui/kbd'

export function SidebarSearch({ inputRef, query, setQuery, label, placeholder, hint }: { inputRef: RefObject<HTMLInputElement | null>; query: string; setQuery: (value: string) => void; label: string; placeholder: string; hint: string }) {
  return <div className="search-field"><Search aria-hidden="true" /><Input ref={inputRef} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={placeholder} aria-label={label} aria-keyshortcuts="/" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setQuery(''); inputRef.current?.blur() } }} />{query ? <button type="button" className="clear-search" aria-label="Clear search" onClick={() => setQuery('')}><X /></button> : <div className="search-shortcuts"><TooltipHint label={<>{hint} <Kbd>/</Kbd> — outside text fields</>}><button type="button" aria-label="Search shortcuts" onClick={() => inputRef.current?.focus()}><kbd>/</kbd></button></TooltipHint></div>}</div>
}
