import { createContext, useContext } from 'react'
import type { Session } from '../../shared/model'

export const SessionNavigation = createContext<((session: Session) => void) | null>(null)
export const useSessionNavigation = () => useContext(SessionNavigation)
export const WorkspaceControls = createContext<{ compact: boolean; find: () => void; create?: () => void; threadId?: string; toggleSidebar?: () => void; sidebarOpen?: boolean } | null>(null)
export const SelectedSession = createContext<string | null>(null)
export const useSelectedSession = () => useContext(SelectedSession)
