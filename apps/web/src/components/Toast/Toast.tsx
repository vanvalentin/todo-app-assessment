import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./Toast.module.scss";

export type ToastTone = "success" | "error";

/** Confirmations clear themselves; problems wait for the reader. */
const AUTO_DISMISS_MS = 5_000;

interface ToastProps {
  message: string;
  tone: ToastTone;
  onDismiss: () => void;
  /** Auto-dismiss delay in milliseconds; `0` keeps the toast until it is dismissed. */
  duration?: number;
}

/**
 * A floating status confirmation. It is portaled to `document.body`, so it never
 * joins the page's layout or its scroll containers, and its live regions stay
 * mounted for as long as the page does: adding text to a region that already
 * exists is what assistive technology announces reliably. Errors are assertive
 * and persistent because they need a decision; confirmations are polite and
 * auto-dismiss, with the countdown paused while the pointer or focus is inside.
 */
export function Toast({ message, tone, onDismiss, duration }: ToastProps) {
  const timeout = duration ?? (tone === "error" ? 0 : AUTO_DISMISS_MS);
  const [isPaused, setIsPaused] = useState(false);
  const remainingRef = useRef(timeout);
  const startedAtRef = useRef<number | null>(null);
  const isVisible = message !== "";

  useEffect(() => {
    if (!isVisible) {
      remainingRef.current = timeout;
      return;
    }
    if (timeout <= 0 || isPaused) return;

    startedAtRef.current = Date.now();
    const timer = window.setTimeout(onDismiss, remainingRef.current);
    return () => {
      window.clearTimeout(timer);
      const startedAt = startedAtRef.current;
      startedAtRef.current = null;
      if (startedAt !== null) {
        remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAt));
      }
    };
  }, [isPaused, isVisible, onDismiss, timeout]);

  const toast = (
    <div
      className={styles.toast}
      data-tone={tone}
      onBlur={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <p className={styles.message}>{message}</p>
      <button
        aria-label="Dismiss notification"
        className={styles.dismiss}
        onClick={onDismiss}
        type="button"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div aria-live="polite" className={styles.region} role="status">
        {isVisible && tone === "success" ? toast : null}
      </div>
      <div className={styles.region} role="alert">
        {isVisible && tone === "error" ? toast : null}
      </div>
    </>,
    document.body,
  );
}
