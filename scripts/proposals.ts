// Routine-facing CLI. Uses the exact same transactional store as the app.
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { proposalInputSchema } from '../shared/proposals.ts'
import { ProposalStore } from '../server/proposal-store.ts'

const [command, filename] = process.argv.slice(2)
if (command !== 'list' && !(command === 'ingest' && filename)) {
  console.error('Usage: npm run proposals -- list | ingest <json-file>\nJSON: an array of proposals with stable projectId/key, title, summary, rationale, prompt, kind, effort and evidence.')
  process.exitCode = 1
} else {
  const store = new ProposalStore()
  try {
    if (command === 'ingest') store.ingest(z.array(proposalInputSchema).max(100).parse(JSON.parse(await readFile(filename, 'utf8'))))
    console.log(JSON.stringify(store.list(), null, 2))
  } catch (error) { console.error(error instanceof Error ? error.message : 'Proposal operation failed'); process.exitCode = 1 }
  finally { store.close() }
}
