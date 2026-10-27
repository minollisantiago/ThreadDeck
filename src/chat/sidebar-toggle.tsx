import { TooltipHint } from '../components/ui/tooltip'

export function SidebarToggle({ open, toggle, className = '' }: { open: boolean; toggle: () => void; className?: string }) {
  return <TooltipHint label={open ? 'Collapse sidebar' : 'Open sidebar'}><button className={`chat-sidebar-toggle ${className}`} aria-label="Toggle session sidebar" aria-expanded={open} aria-controls="session-manager" onClick={toggle}>
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true" data-expanded={open}><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></svg>
  </button></TooltipHint>
}
