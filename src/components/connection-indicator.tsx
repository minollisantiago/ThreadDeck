import type { Snapshot } from '../../shared/model'

export function ConnectionIndicator({ snapshot, verified, loading, healthLabel, transportError }: {
  snapshot: Snapshot | null; verified: boolean; loading: boolean; healthLabel: string; transportError: boolean
}) {
  return <div className="connection">
    <button className="connection-trigger" aria-label={healthLabel} aria-describedby="connection-details" type="button">
      <span className={`connection-dot ${verified ? 'healthy' : loading ? '' : 'unhealthy'}`} aria-hidden="true" />
      <span role="status" className="sr-only">{healthLabel}</span>
    </button>
    <div className="connection-tooltip" id="connection-details" role="tooltip">
      <strong>{healthLabel}</strong>
      <span>Automatic refresh enabled</span>
      <span>{snapshot?.lastSuccessAt != null ? `Last successful update: ${new Date(snapshot.lastSuccessAt).toLocaleString()}` : 'Waiting for first successful update'}</span>
      {snapshot && snapshot.checkedAt > 0 && <span>Last source check: {new Date(snapshot.checkedAt).toLocaleString()}</span>}
      {transportError && <span>Cannot reach the dashboard server.</span>}
      {snapshot?.message && <span>{snapshot.message}</span>}
      {snapshot && !snapshot.attentionAvailable && <span>Attention status unavailable.</span>}
      {snapshot?.inventoryLimited && <span>Recent session inventory is limited.</span>}
    </div>
  </div>
}
