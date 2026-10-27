import { useContext } from 'react'
import { Plus } from 'lucide-react'
import type { Project } from '../../shared/model'
import { WorkspaceControls } from '../chat/navigation'
import { Button } from './ui/button'

export function ProjectCreateButton({ project }: { project: Project }) {
  const workspace = useContext(WorkspaceControls)
  if (!workspace?.create) return null
  return <Button variant="ghost" size="icon" className="project-create" aria-label={`New session in ${project.name}`} title={`New session in ${project.name}`} onClick={() => workspace.create?.(project)}><Plus aria-hidden="true" /></Button>
}
