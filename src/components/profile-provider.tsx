import type { ReactNode } from 'react'
import { ProfileContext, useProfile } from '../hooks/use-profile'

export function ProfileProvider({ children }: { children: ReactNode }) {
  const identity = useProfile()
  return <ProfileContext.Provider value={identity}>{children}</ProfileContext.Provider>
}
