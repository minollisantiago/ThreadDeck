import { createContext, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { discordProfileSchema, discordUserIdSchema, profileResponseSchema } from '../../shared/profile'
import { ChatRequestError, chatRequest } from '../chat/api'

const savedProfileSchema = z.object({ selection: z.union([z.literal('default'), z.literal('local'), discordUserIdSchema]), profile: discordProfileSchema.nullable() })
const key = 'threaddeck:profile'
function savedProfile(): z.infer<typeof savedProfileSchema> {
  try { return savedProfileSchema.parse(JSON.parse(localStorage.getItem(key) || 'null')) }
  catch { return { selection: 'default', profile: null } }
}

export function useProfile() {
  const [saved, setSaved] = useState(savedProfile)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)
  async function load(selection = saved.selection) {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    if (selection === 'local') { setSaved({ selection, profile: null }); setError(null); setPending(false); return }
    setPending(true); setError(null)
    try {
      const query = selection === 'default' ? '' : `?userId=${encodeURIComponent(selection)}`
      const value = await chatRequest(`profile${query}`, profileResponseSchema, { signal: controller.signal })
      if (controller.signal.aborted) return
      if (value.profile && selection !== 'default' && value.profile.id !== selection) throw new Error('Discord returned a different user. Your previous profile is unchanged.')
      setSaved({ selection, profile: value.profile })
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof ChatRequestError && error.code === 'unsupported'
        ? 'Discord profiles need an updated local Kimaki bridge. Prepare the fork and use it the next time you deliberately restart Kimaki. Local preferences still work.'
        : error instanceof z.ZodError ? 'Discord returned an invalid profile. Your previous profile is unchanged.'
          : error instanceof Error ? error.message : 'Could not load Discord profile. Local preferences still work.')
    } finally { if (!controller.signal.aborted) setPending(false) }
  }
  useEffect(() => { void load(); return () => request.current?.abort() }, [])
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(saved)) } catch { /* Local preferences are optional. */ } }, [saved])
  return { profile: saved.profile, selection: saved.selection, pending, error, refresh: () => load(), connect: (userId: string) => load(discordUserIdSchema.parse(userId)), useLocal: () => load('local') }
}

export const ProfileContext = createContext<ReturnType<typeof useProfile> | null>(null)
