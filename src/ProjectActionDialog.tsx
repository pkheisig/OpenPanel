import { useEffect, useId, useRef } from 'react'
import './ProjectActionDialog.css'

export type ProjectActionDialogMode = 'rename' | 'delete'

type ProjectActionDialogProps = {
  mode: ProjectActionDialogMode
  panelName: string
  value: string
  busy?: boolean
  error?: string
  onChange: (value: string) => void
  onCancel: () => void
  onSubmit: () => void | Promise<void>
}

export function ProjectActionDialog({
  mode,
  panelName,
  value,
  busy = false,
  error = '',
  onChange,
  onCancel,
  onSubmit,
}: ProjectActionDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const errorId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const destructive = mode === 'delete'

  useEffect(() => {
    if (destructive) cancelRef.current?.focus({ preventScroll: true })
    else inputRef.current?.focus({ preventScroll: true })
  }, [destructive])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [busy, onCancel])

  return (
    <div
      className="project-action-dialog-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
    >
      <form
        className="suite-dialog project-action-dialog"
        role={destructive ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onSubmit={(event) => {
          event.preventDefault()
          if (!busy) void onSubmit()
        }}
      >
        <h2 id={titleId}>{destructive ? `Delete ${panelName}?` : 'Rename project'}</h2>
        <p id={descriptionId}>
          {destructive
            ? 'This permanently deletes the saved project and cannot be undone.'
            : 'Choose a name for this saved project.'}
        </p>
        {!destructive && (
          <label className="suite-field project-action-dialog-field">
            <span className="suite-label">Project name</span>
            <input
              ref={inputRef}
              className="suite-input"
              value={value}
              aria-label="Project name"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              disabled={busy}
              autoComplete="off"
              onChange={(event) => onChange(event.target.value)}
            />
          </label>
        )}
        {error && <p id={errorId} className="project-action-dialog-error" role="alert">{error}</p>}
        <div className="suite-dialog-actions project-action-dialog-actions">
          <button ref={cancelRef} type="button" className="suite-button suite-button--quiet" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            className={`suite-button ${destructive ? 'suite-button--destructive' : 'suite-button--primary'}`}
            disabled={busy || (!destructive && !value.trim())}
          >
            {busy ? (destructive ? 'Deleting…' : 'Saving…') : destructive ? 'Delete project' : 'Save name'}
          </button>
        </div>
      </form>
    </div>
  )
}
