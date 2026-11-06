import { z } from 'zod'

export const discordUserIdSchema = z.string().regex(/^\d{17,20}$/)
export const discordProfileSchema = z.object({
  id: discordUserIdSchema,
  username: z.string().min(1).max(100),
  displayName: z.string().min(1).max(100),
  avatarUrl: z.string().url().refine(value => {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'cdn.discordapp.com' && !url.username && !url.password && !url.port
      && (/^\/avatars\/\d{17,20}\/[a-zA-Z0-9_]+\.(png|webp|gif)$/.test(url.pathname) || /^\/embed\/avatars\/\d+\.png$/.test(url.pathname))
  }).nullable(),
})
export const profileResponseSchema = z.object({ profile: discordProfileSchema.nullable() })
export type DiscordProfile = z.infer<typeof discordProfileSchema>
