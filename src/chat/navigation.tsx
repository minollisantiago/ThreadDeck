import { createContext, useContext } from 'react'
import type { Project, Session } from '../../shared/model'

export const SessionNavigation = createContext<((session: Session) => void) | null>(null)
export const useSessionNavigation = () => useContext(SessionNavigation)
export const WorkspaceControls = createContext<{ compact: boolean; find: () => void; create?: (project?: Project) => void; discover?: () => void; threadId?: string; toggleSidebar?: () => void; sidebarOpen?: boolean } | null>(null)
export const SelectedSession = createContext<string | null>(null)
export const useSelectedSession = () => useContext(SelectedSession)
