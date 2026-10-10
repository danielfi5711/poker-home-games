import { Sheet } from "../ui.js";

interface Props {
  title: string;
  body: string;
  confirmLabel: string;
  /** Styles the confirm button as destructive (red) vs. default (gold). */
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmModal({
  title,
  body,
  confirmLabel,
  danger,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <Sheet onClose={() => onCancel()}>
      <h2 class="modal__title">{title}</h2>
      <p class="hint">{body}</p>
      <div class="btnrow">
        <button class="btn btn--lg" onClick={onCancel}>
          Cancel
        </button>
        <button
          class={`btn btn--lg ${danger ? "btn--danger" : "btn--primary"}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
