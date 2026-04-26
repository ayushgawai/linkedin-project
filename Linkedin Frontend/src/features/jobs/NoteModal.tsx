import { useState, useEffect } from 'react'
import { Button, Modal, Textarea, useToast } from '../../components/ui'
import { useTrackerNotesStore } from '../../store/trackerNotesStore'

type NoteModalProps = {
  isOpen: boolean
  onClose: () => void
  applicationId: string | null
  initial: string
}

const MAX = 500

export function NoteModal({ isOpen, onClose, applicationId, initial }: NoteModalProps): JSX.Element | null {
  const { toast } = useToast()
  const setNote = useTrackerNotesStore((s) => s.setNote)
  const [text, setText] = useState(initial)

  useEffect(() => {
    setText(initial)
  }, [initial, applicationId, isOpen])

  if (!applicationId) {
    return null
  }

  const title = initial.trim() ? 'Edit note' : 'Add note'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <Modal.Header>{title}</Modal.Header>
      <Modal.Body>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX))}
          className="min-h-[100px] resize-y"
          autoFocus
        />
        <p className="mt-1 text-right text-xs text-text-tertiary">
          {text.length}/{MAX}
        </p>
      </Modal.Body>
      <Modal.Footer className="flex justify-end gap-2">
        <Button variant="tertiary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            setNote(applicationId, text)
            toast({ variant: 'success', title: 'Note saved' })
            onClose()
          }}
        >
          Save
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
