import { useContext } from 'react'
import { Plus } from 'lucide-react'
import type { Project } from '../../shared/model'
import { WorkspaceControls } from '../chat/navigation'
import { Button } from './ui/button'
import { TooltipHint } from './ui/tooltip'
import { Kbd, KbdGroup } from './ui/kbd'

export function ProjectCreateButton({ project }: { project: Project }) {
  const workspace = useContext(WorkspaceControls)
  if (!workspace?.create) return null
  const current = project.sessions.some(session => session.threadId === workspace.threadId)
  return <TooltipHint label={<>New session in {project.name}<br /><KbdGroup><Kbd>Ctrl / ⌘</Kbd>+<Kbd>Shift</Kbd>+<Kbd>N</Kbd></KbdGroup> — {current ? 'in this project' : 'in the current project'}</>}><Button variant="ghost" size="icon" className="project-create" aria-label={`New session in ${project.name}`} aria-keyshortcuts={current ? 'Control+Shift+N Meta+Shift+N' : undefined} onClick={() => workspace.create?.(project)}><Plus aria-hidden="true" /></Button></TooltipHint>
}
