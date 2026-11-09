import { useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, CircleHelp, ExternalLink, RefreshCw, Settings2, UserRound, X } from 'lucide-react'
import { discordUserIdSchema, type DiscordProfile } from '../../shared/profile'
import type { DesktopPreferences } from '../../shared/desktop'
import { ProfileContext, useProfile } from '../hooks/use-profile'
import { ProfileAvatar } from './profile-avatar'
import { TooltipHint } from './ui/tooltip'
import './profile-controls.css'

function Identity({ profile }: { profile: DiscordProfile | null }) {
  return <div className="profile-identity"><ProfileAvatar profile={profile} large /><div><strong>{profile?.displayName || 'Local operator'}</strong><span>{profile ? `@${profile.username}` : 'Your space, on this machine'}</span><small>{profile ? 'From Discord' : 'Local profile'}</small></div></div>
}

function NotificationSettings() {
  const desktop = window.threaddeckDesktop
  const [settings, setSettings] = useState<DesktopPreferences | null>(null)
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    let active = true, updated = false
    const unsubscribe = desktop?.onPreferences?.(value => { updated = true; if (active) setSettings(value) })
    void desktop?.preferences?.().then(value => { if (active && !updated) { setSettings(value); setError(!value) } }).catch(() => { if (active) setError(true) })
    return () => { active = false; unsubscribe?.() }
  }, [desktop])
  async function change(key: keyof DesktopPreferences, checked: boolean) {
    setSaving(true); setError(false)
    try { const value = await desktop?.preferences?.({ [key]: checked }); if (!value) throw new Error('Unavailable'); setSettings(value) }
    catch { setError(true) }
    finally { setSaving(false) }
  }
  if (!desktop?.preferences) return <p className="profile-note">{desktop ? 'Reopen the updated desktop app to use these controls. Existing tray notification controls still work.' : 'Desktop alerts are available in the ThreadDeck desktop app. Browser notifications are not enabled.'}</p>
  if (!settings) return <p className="profile-note" role="status">{error ? 'Could not load desktop notification settings.' : 'Loading desktop notification settings…'}</p>
  return <>{([
    ['paused', 'Pause all notifications'], ['completionAlerts', 'When a session finishes'], ['attentionAlerts', 'When attention is needed'], ['sounds', 'Play notification sounds'], ['closeToTray', 'Close to tray'],
  ] as const).map(([key, label]) => <label className="profile-setting-row" key={key}><span>{label}</span><input type="checkbox" role="switch" checked={settings[key]} disabled={saving || key !== 'paused' && key !== 'closeToTray' && settings.paused} onChange={event => void change(key, event.target.checked)} /></label>)}{error && <p className="profile-error" role="alert">Could not save notification preferences. Try again.</p>}</>
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

interface ProfileControlsProps { healthLabel: string; verified: boolean; loading: boolean; connectionDetails: string }

function ProfilePopup({ identity, healthLabel, verified, loading, connectionDetails }: ProfileControlsProps & { identity: ReturnType<typeof useProfile> }) {
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const back = useRef<HTMLButtonElement>(null)
  const preferencesButton = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [preferences, setPreferences] = useState(false)
  const id = useId()
  useLayoutEffect(() => {
    const popup = panel.current!
    const position = () => {
      if (!trigger.current) return
      const rect = trigger.current.getBoundingClientRect()
      const width = Math.min(preferences ? 360 : 300, window.innerWidth - 24)
      const above = rect.top - 22, below = window.innerHeight - rect.bottom - 22
      popup.style.width = `${width}px`
      const rail = trigger.current.closest('.collapsed-sidebar')
      popup.style.left = `${Math.max(12, Math.min(rail ? rect.right + 14 : rect.right - width, window.innerWidth - width - 12))}px`
      popup.style.top = above >= below ? 'auto' : `${rect.bottom + 10}px`
      popup.style.bottom = above >= below ? `${window.innerHeight - rect.top + 10}px` : 'auto'
      popup.style.maxHeight = `${Math.max(120, Math.max(above, below))}px`
    }
    const beforeToggle = (event: ToggleEvent) => { if (event.newState === 'open') position() }
    const toggle = (event: ToggleEvent) => {
      setOpen(event.newState === 'open')
      if (event.newState === 'closed') {
        setPreferences(false)
        if (popup.contains(document.activeElement) || document.activeElement === document.body) trigger.current?.focus({ preventScroll: true })
      }
      else (preferences ? back : preferencesButton).current?.focus({ preventScroll: true })
    }
    popup.addEventListener('beforetoggle', beforeToggle)
    popup.addEventListener('toggle', toggle)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    position()
    if (open) (preferences ? back : preferencesButton).current?.focus({ preventScroll: true })
    return () => { popup.removeEventListener('beforetoggle', beforeToggle); popup.removeEventListener('toggle', toggle); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true) }
  }, [preferences])
  const close = () => { panel.current?.hidePopover(); trigger.current?.focus() }
  return <><TooltipHint label="Profile and preferences"><button ref={trigger} className="profile-trigger" popoverTarget={id} aria-label="Profile and preferences" aria-haspopup="dialog" aria-controls={id} aria-expanded={open}><ProfileAvatar profile={identity.profile} /></button></TooltipHint>
    <div ref={panel} id={id} popover="auto" role="dialog" aria-label="Profile and preferences" className="profile-popup" data-preferences={preferences} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() } }}>
      <div className="profile-popup-heading">{preferences ? <><button ref={back} className="profile-icon-button" aria-label="Back to profile" onClick={() => setPreferences(false)}><ArrowLeft /></button><h2>All preferences</h2></> : <Identity profile={identity.profile} />}<button className="profile-icon-button" aria-label="Close profile popup" onClick={close}><X /></button></div>
      <div className="profile-popup-body">{preferences ? <><Identity profile={identity.profile} /><section className="profile-section" aria-labelledby="profile-notifications-title"><h3 id="profile-notifications-title">Notifications</h3><NotificationSettings /></section><IdentitySettings identity={identity} /></> : <button ref={preferencesButton} className="profile-menu-item" onClick={() => setPreferences(true)}><Settings2 />All preferences<ChevronRight /></button>}
      {identity.profile && <a className="profile-menu-item" data-chat-external href={`https://discord.com/users/${identity.profile.id}`} target="_blank" rel="noopener noreferrer"><UserRound />View Discord profile<ExternalLink /></a>}</div>
      <div className="profile-popup-connection"><span className={`connection-dot ${verified ? 'healthy' : loading ? '' : 'unhealthy'}`} aria-hidden="true" /><div><strong>Backend · {healthLabel.toLowerCase()}</strong>{preferences && <><span>{connectionDetails}</span><small>Connection status, not Discord presence</small></>}</div></div>
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
