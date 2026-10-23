import { z } from 'zod'

export const searchHitSchema = z.object({
  id: z.string(), title: z.string(), project: z.string(), threadId: z.string(),
  guildId: z.string().nullable(), updatedAt: z.number(), excerpt: z.string(), matches: z.number(),
})
export const searchResponseSchema = z.object({
  hits: z.array(searchHitSchema), indexing: z.boolean(), indexed: z.number(), error: z.string().nullable(),
})
export type SearchHit = z.infer<typeof searchHitSchema>
export type SearchResponse = z.infer<typeof searchResponseSchema>

// Subsequence matching belongs on short labels, never entire conversation logs.
export function fuzzyScore(query: string, label: string) {
  const needle = query.toLocaleLowerCase(), haystack = label.toLocaleLowerCase()
  if (haystack.includes(needle)) return 100 + needle.length / Math.max(1, haystack.length)
  let position = -1, gaps = 0
  for (const char of needle) {
    const next = haystack.indexOf(char, position + 1)
    if (next < 0) return 0
    gaps += next - position - 1
    position = next
  }
  return 10 / (1 + gaps)
}
