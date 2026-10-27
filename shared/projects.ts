import { z } from 'zod'
import { projectSchema } from './model.ts'

export const projectBrowseSchema = z.object({
  directory: z.string(), parent: z.string().nullable(),
  entries: z.array(z.object({ name: z.string(), directory: z.string(), repository: z.boolean(), registered: projectSchema.nullable() })),
  registered: projectSchema.nullable(),
  locations: z.array(z.string()), guilds: z.array(z.string()),
})
export type ProjectBrowse = z.infer<typeof projectBrowseSchema>
export const registerProjectSchema = z.object({ directory: z.string().min(1).max(4096), guild: z.string().regex(/^\d{17,20}$/).optional() })
