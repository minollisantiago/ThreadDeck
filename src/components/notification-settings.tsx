import { useEffect, useState } from 'react'
import type { DesktopPreferences } from '../../shared/desktop'

export function NotificationSettings() {
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
