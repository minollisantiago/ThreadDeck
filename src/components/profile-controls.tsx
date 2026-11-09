import { useContext, useId, useRef, useState } from 'react'
import { CircleHelp, ExternalLink, RefreshCw, UserRound, X } from 'lucide-react'
import { discordUserIdSchema, type DiscordProfile } from '../../shared/profile'
import { useDockPopover } from '../hooks/use-dock-popover'
import { ProfileContext, useProfile } from '../hooks/use-profile'
import { ProfileAvatar } from './profile-avatar'
import { TooltipHint } from './ui/tooltip'
import './profile-controls.css'

function Identity({ profile }: { profile: DiscordProfile | null }) {
  return <div className="profile-identity"><ProfileAvatar profile={profile} large /><div><strong>{profile?.displayName || 'Local operator'}</strong><span>{profile ? `@${profile.username}` : 'Your space, on this machine'}</span><small>{profile ? 'From Discord' : 'Local profile'}</small></div></div>
}

function IdentitySettings({ identity }: { identity: ReturnType<typeof useProfile> }) {
  const [userId, setUserId] = useState(identity.profile?.id || (discordUserIdSchema.safeParse(identity.selection).success ? identity.selection : ''))
  const [invalid, setInvalid] = useState(false)
  return <section className="profile-section" aria-labelledby="profile-identity-title"><h3 id="profile-identity-title">Identity</h3><form onSubmit={event => { event.preventDefault(); if (!discordUserIdSchema.safeParse(userId.trim()).success) { setInvalid(true); return } setInvalid(false); void identity.connect(userId.trim()) }}>
        <div className="profile-user-heading"><label className="profile-user-label" htmlFor="profile-discord-id">Discord user ID</label><TooltipHint disableHoverableContent label={<>Discord → Settings → Advanced → Developer Mode.<br />Right-click your own name → Copy User ID.<br />This only changes your display profile, not message authorship.</>}><button type="button" className="profile-help" aria-label="How to find your Discord user ID"><CircleHelp aria-hidden="true" /></button></TooltipHint></div>
        <div className="profile-user-input"><input id="profile-discord-id" value={userId} inputMode="numeric" placeholder="Your Discord user ID" aria-invalid={invalid} aria-describedby={invalid ? 'profile-id-error' : undefined} onChange={event => { setUserId(event.target.value); setInvalid(false) }} /><button disabled={identity.pending} type="submit">{identity.pending ? 'Loading…' : 'Load profile'}</button></div>{invalid && <p id="profile-id-error" className="profile-error" role="alert">Enter a Discord user ID (17–20 digits).</p>}</form>
        {identity.error && <p className="profile-error" role="alert">{identity.error}</p>}
        <div className="profile-identity-actions"><button disabled={identity.pending || identity.selection === 'local'} onClick={() => void identity.refresh()}><RefreshCw />Refresh name & avatar</button><button disabled={identity.pending || identity.selection === 'local'} onClick={() => { setUserId(''); void identity.useLocal() }}>Use local profile</button></div>
      </section>
}

interface ProfileControlsProps { healthLabel: string; verified: boolean; loading: boolean; connectionDetails: string; showIdentity?: boolean }

function ProfilePopup({ identity, healthLabel, verified, loading, connectionDetails, showIdentity = false }: ProfileControlsProps & { identity: ReturnType<typeof useProfile> }) {
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const { open, close } = useDockPopover({ trigger, panel, align: 'left', width: 360, focus: closeButton })
  const id = useId()
  return <><TooltipHint label="Profile and preferences"><button ref={trigger} className={`profile-trigger${showIdentity ? ' profile-trigger-identity' : ''}`} popoverTarget={id} aria-label="Profile and preferences" aria-haspopup="dialog" aria-controls={id} aria-expanded={open}><ProfileAvatar profile={identity.profile} />{showIdentity && <span className="profile-trigger-copy"><strong>{identity.profile?.displayName || 'Local operator'}</strong><small>{identity.profile ? `@${identity.profile.username}` : 'Local profile'}</small></span>}</button></TooltipHint>
    <div ref={panel} id={id} popover="auto" role="dialog" aria-label="Profile and preferences" className="profile-popup" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() } }}>
      <div className="profile-popup-heading"><Identity profile={identity.profile} /><button ref={closeButton} className="profile-icon-button" aria-label="Close profile popup" onClick={close}><X /></button></div>
      <div className="profile-popup-body">{identity.profile && <a className="profile-menu-item" data-chat-external href={`https://discord.com/users/${identity.profile.id}`} target="_blank" rel="noopener noreferrer"><UserRound />View Discord profile<ExternalLink /></a>}<IdentitySettings identity={identity} /></div>
      <div className="profile-popup-connection"><span className={`connection-dot ${verified ? 'healthy' : loading ? '' : 'unhealthy'}`} aria-hidden="true" /><div><strong>Backend · {healthLabel.toLowerCase()}</strong><span>{connectionDetails}</span><small>Connection status, not Discord presence</small></div></div>
    </div></>
}

function StandaloneProfileControls(props: ProfileControlsProps) {
  const identity = useProfile()
  return <ProfilePopup {...props} identity={identity} />
}

export function ProfileControls(props: ProfileControlsProps) {
  const identity = useContext(ProfileContext)
  return identity ? <ProfilePopup {...props} identity={identity} /> : <StandaloneProfileControls {...props} />
}
