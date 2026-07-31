import { useId } from 'react'
import './ClearPanelConfirmation.css'

type ClearPanelConfirmationProps = {
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void | Promise<void>
}

export function ClearPanelConfirmation({
  busy = false,
  onCancel,
  onConfirm,
}: ClearPanelConfirmationProps) {
  const titleId = useId()
  const descriptionId = useId()

  return (
    <div
      className="clear-panel-confirm-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
    >
      <section
        className="clear-panel-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <h3 id={titleId}>Clear the panel?</h3>
        <p id={descriptionId}>
          This clears every marker and color from the panel and sidebar. You can undo it from the editor header.
        </p>
        <div>
          <button type="button" className="clear-panel-confirm-cancel" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="clear-panel-confirm-submit"
            onClick={() => void onConfirm()}
            disabled={busy}
          >
            {busy ? 'Clearing…' : 'Clear panel'}
          </button>
        </div>
      </section>
    </div>
  )
}
