import { createContext, useContext } from 'react'

export type WorkspaceSection = 'threads' | 'schedules' | 'proposals'
export type WorkspaceSections = { section: WorkspaceSection; setSection: (value: WorkspaceSection) => void }
export const WorkspaceSectionsContext = createContext<WorkspaceSections | null>(null)
export function WorkspaceTabs() {
  const navigation = useContext(WorkspaceSectionsContext)
  if (!navigation) return null
  return <div className="schedules-tabs" aria-label="Workspace section">{(['threads', 'schedules', 'proposals'] as const).map(section => <button key={section} type="button" aria-pressed={navigation.section === section} onClick={() => navigation.setSection(section)}>{section[0].toUpperCase() + section.slice(1)}</button>)}</div>
}
