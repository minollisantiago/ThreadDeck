import { useContext, useState, type ReactNode } from 'react'
import { UserRound } from 'lucide-react'
import type { DiscordProfile } from '../../shared/profile'
import { ProfileContext } from '../hooks/use-profile'
import './profile-avatar.css'

function ProfilePhoto({ url, fallback }: { url: string; fallback: ReactNode }) {
  const [failed, setFailed] = useState(false)
  return failed ? fallback : <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
}

export function ProfileAvatar({ profile, large = false, className = '', fallback }: { profile: DiscordProfile | null; large?: boolean; className?: string; fallback?: string }) {
  const initials = profile?.displayName.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toLocaleUpperCase()
  const placeholder = initials || fallback || <UserRound />
  return <span className={`profile-avatar ${large ? 'profile-avatar-large' : ''} ${className}`} aria-hidden="true">{profile?.avatarUrl ? <ProfilePhoto key={profile.avatarUrl} url={profile.avatarUrl} fallback={placeholder} /> : placeholder}</span>
}

export function UserPromptAvatar() {
  const identity = useContext(ProfileContext)
  return <ProfileAvatar profile={identity?.profile ?? null} className="chat-avatar" fallback="Y" />
}
