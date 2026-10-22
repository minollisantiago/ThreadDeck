export const reconciliationIntervalMs = 30_000

// A quiet event stream is healthy. Allow two reconciliation cycles plus request
// headroom before treating a silently frozen backend as stale. Explicit failures
// still surface immediately through snapshot health or transportError.
export const snapshotStaleAfterMs = 2 * reconciliationIntervalMs + 15_000
