import { Modal } from '../../components/ui'
import type { MemberApplication } from '../../types/tracker'

type ApplicationDetailModalProps = {
  isOpen: boolean
  onClose: () => void
  app: MemberApplication | null
}

export function ApplicationDetailModal({ isOpen, onClose, app }: ApplicationDetailModalProps): JSX.Element | null {
  if (!app) {
    return null
  }
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Application" size="md">
      <Modal.Header>Application</Modal.Header>
      <Modal.Body>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-text-tertiary">Application ID</dt>
            <dd className="font-mono text-text-primary">{app.application_id}</dd>
          </div>
          <div>
            <dt className="text-text-tertiary">Job</dt>
            <dd className="text-text-primary">{app.job.title}</dd>
          </div>
          <div>
            <dt className="text-text-tertiary">Company</dt>
            <dd className="text-text-primary">{app.job.company_name}</dd>
          </div>
          <div>
            <dt className="text-text-tertiary">Status</dt>
            <dd className="text-text-primary">{app.status}</dd>
          </div>
          <div>
            <dt className="text-text-tertiary">Applied</dt>
            <dd className="text-text-primary">{new Date(app.applied_at).toLocaleString()}</dd>
          </div>
        </dl>
      </Modal.Body>
    </Modal>
  )
}
