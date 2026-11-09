import { TooltipHint } from '../components/ui/tooltip'

export function SidebarToggle({ open, toggle, className = '', rail = false }: { open: boolean; toggle: () => void; className?: string; rail?: boolean }) {
  return <TooltipHint label={open ? 'Collapse sidebar' : 'Open sidebar'}><button className={`chat-sidebar-toggle ${className}`} aria-label="Toggle session sidebar" aria-expanded={open} aria-controls="session-manager" onClick={toggle}>
    {rail ? <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16m4-11 3 3-3 3" /></svg> : <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true" data-expanded={open}><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></svg>}
  </button></TooltipHint>
}
