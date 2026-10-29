import { CircleHelp } from 'lucide-react'
import { TooltipHint } from './ui/tooltip'
import './project-activity.css'

// Original CSS matrix animation inspired by https://generativeloaders.com/docs#components.
const wave = [0, 1, 2, 1, 2, 3, 2, 3, 4]

export function ProjectActivity({ count, verified, projectName }: { count: number; verified: boolean; projectName: string }) {
  const state = !verified ? 'unknown' : count > 0 ? 'working' : 'idle'
  const label = !verified ? `Working status unavailable in ${projectName}` : `${count} working ${count === 1 ? 'session' : 'sessions'} in ${projectName}`
  return <span className="project-activity-slot" data-state={state} aria-hidden={state === 'idle' ? true : undefined}>
    <TooltipHint label={label}><span className={`project-activity ${verified ? 'status-working' : 'status-unknown'}`} role="img" aria-label={label} tabIndex={state === 'idle' ? undefined : 0}>
      {state === 'working' ? <span className="project-activity-loader" aria-hidden="true">{wave.map((step, index) => <i key={index} style={{ animationDelay: `${step * 100}ms` }} />)}</span> : <CircleHelp size={12} aria-hidden="true" />}
      <span className="project-activity-count" aria-hidden="true">{!verified ? '—' : count > 99 ? '99+' : count}</span>
    </span></TooltipHint>
  </span>
}
