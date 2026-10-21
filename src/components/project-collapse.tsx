import type { ReactNode } from 'react'

// Keep content mounted for reversible CSS motion, but disable it as soon as closed.
export function ProjectCollapse({ id, collapsed, children }: { id: string; collapsed: boolean; children: ReactNode }) {
  return <div id={id} className="project-collapse" data-collapsed={collapsed} inert={collapsed} aria-hidden={collapsed}>
    <div className="project-collapse-clip">{children}</div>
  </div>
}
