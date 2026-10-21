import { CircleAlert } from 'lucide-react'

export function ConnectionNotice({ visible, hasSnapshot }: { visible: boolean; hasSnapshot: boolean }) {
  return <div className="connection-notice-region" data-visible={visible} aria-hidden={!visible} inert={!visible}>
    <div className="connection-notice-clip">
      <div className="connection-notice" role={visible ? 'alert' : undefined}>
        <CircleAlert /><div><strong>Live status unavailable</strong><p>{hasSnapshot ? 'Showing your last snapshot. Retrying automatically.' : 'Check that Kimaki and OpenCode are running. Retrying automatically.'}</p></div>
      </div>
    </div>
  </div>
}
