import { AlertTriangle, CircleHelp } from './icon';
import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  open: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Confirm',
  danger = false,
  open,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLButtonElement>('.confirm-dialog-cancel')?.focus();
    }
    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={`project-dialog confirm-dialog${danger ? ' confirm-dialog--danger' : ''}`}
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onCancel();
      }}
    >
      <div className="confirm-dialog-body">
        <span className={`confirm-dialog-icon${danger ? ' confirm-dialog-icon--danger' : ''}`}>
          {danger ? <AlertTriangle size={21} /> : <CircleHelp size={21} />}
        </span>
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
      <div className="dialog-actions confirm-dialog-actions">
        <button
          className="button button--secondary confirm-dialog-cancel"
          type="button"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          className={`button ${danger ? 'button--danger' : 'button--primary'}`}
          type="button"
          onClick={onConfirm}
          disabled={busy}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
