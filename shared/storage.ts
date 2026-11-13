import { z } from 'zod'

export const uploadStorageSchema = z.object({ used: z.number(), reclaimable: z.number(), protected: z.number(), count: z.number(), budget: z.number() })
