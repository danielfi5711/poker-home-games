interface Props {
  title: string;
  body: string;
  confirmLabel: string;
  /** Styles the confirm button as destructive (red) vs. default (gold). */
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmModal({ title, body, confirmLabel, danger, onCancel, onConfirm }: Props) {
  return (
    <div class="modal">
      <div class="modal__panel">
        <div class="modal__handle" />
        <h2>{title}</h2>
        <p class="hint">{body}</p>
        <div class="actions">
          <button class="btn" onClick={onCancel}>
            Cancel
          </button>
          <button class={`btn ${danger ? 'btn--danger' : 'btn--primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
