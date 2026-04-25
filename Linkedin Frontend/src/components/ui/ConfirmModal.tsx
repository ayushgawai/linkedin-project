import { Button } from './Button'
import { Modal } from './Modal'
import { Spinner } from './Spinner'

type ConfirmModalProps = {
  isOpen: boolean
  onClose: () => void
  title: string
  message: string
  confirmLabel: string
  confirmVariant: 'primary' | 'destructive'
  onConfirm: () => void | Promise<void>
  cancelLabel?: string
  loading?: boolean
  children?: React.ReactNode
}

export function ConfirmModal({
  isOpen,
  onClose,
  title,
  message,
  confirmLabel,
  confirmVariant,
  onConfirm,
  cancelLabel = 'Cancel',
  loading = false,
  children,
}: ConfirmModalProps): JSX.Element | null {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <Modal.Header>{title}</Modal.Header>
      <Modal.Body>
        <p className="text-sm text-text-secondary">{message}</p>
        {children ? <div className="mt-3">{children}</div> : null}
      </Modal.Body>
      <Modal.Footer className="flex justify-end gap-2">
        <Button variant="tertiary" onClick={onClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          variant={confirmVariant === 'destructive' ? 'destructive' : 'primary'}
          disabled={loading}
          onClick={() => void onConfirm()}
        >
          {loading ? <Spinner size="sm" className="text-current" /> : null}
          {confirmLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
