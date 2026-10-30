import { z } from 'zod'

export const renameSessionSchema = z.object({
  title: z.string().trim().min(1).max(100).refine(title => !/[\x00-\x1f\x7f]/.test(title), 'Use a single-line title'),
}).strict()
