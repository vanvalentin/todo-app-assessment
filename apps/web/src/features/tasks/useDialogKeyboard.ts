import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

const FOCUSABLE =
  "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]";

/** Shared keyboard behavior for the task dialogs: Escape closes, Tab stays inside. */
export function useDialogKeyboard(onClose: () => void) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      if (!isBusy) onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const first = focusable.at(0);
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return { dialogRef, handleKeyDown, isBusy, setIsBusy };
}
