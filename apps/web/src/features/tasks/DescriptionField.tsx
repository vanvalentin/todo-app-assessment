import { TASK_DESCRIPTION_MAX_LENGTH } from "@ksat/contracts";
import { useId, useRef, useState } from "react";
import { MarkdownContent } from "./MarkdownContent";
import styles from "./DescriptionField.module.scss";

type Mode = "write" | "preview";

interface DescriptionFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
  /** Existing descriptions open on their rendered preview; new ones open for writing. */
  readonly initialMode?: Mode;
}

/**
 * Markdown description editor with formatting controls and one Preview toggle.
 * Editing is the default surface; activating Preview swaps in the safe renderer.
 */
export function DescriptionField({
  value,
  onChange,
  disabled = false,
  initialMode = "write",
}: DescriptionFieldProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const helpId = `${baseId}-help`;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const remaining = TASK_DESCRIPTION_MAX_LENGTH - value.length;

  const replaceSelection = (prefix: string, suffix: string, placeholder: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { selectionStart, selectionEnd } = textarea;
    const selected = value.slice(selectionStart, selectionEnd);
    const content = selected || placeholder;
    const next = `${value.slice(0, selectionStart)}${prefix}${content}${suffix}${value.slice(selectionEnd)}`;
    if (next.length > TASK_DESCRIPTION_MAX_LENGTH) return;
    onChange(next);
    const nextStart = selectionStart + prefix.length;
    const nextEnd = nextStart + content.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextStart, nextEnd);
    });
  };

  const prefixSelectedLines = (prefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const lineStart = value.lastIndexOf("\n", Math.max(0, textarea.selectionStart - 1)) + 1;
    const selectedEnd = textarea.selectionEnd;
    const block = value.slice(lineStart, selectedEnd);
    const nextBlock = block
      .split("\n")
      .map((line) => `${prefix}${line}`)
      .join("\n");
    const next = `${value.slice(0, lineStart)}${nextBlock}${value.slice(selectedEnd)}`;
    if (next.length > TASK_DESCRIPTION_MAX_LENGTH) return;
    onChange(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(lineStart + prefix.length, lineStart + nextBlock.length);
    });
  };

  const togglePreview = () => {
    const next: Mode = mode === "preview" ? "write" : "preview";
    setMode(next);
    if (next === "write") requestAnimationFrame(() => textareaRef.current?.focus());
  };

  return (
    <section className={styles.field} aria-labelledby={labelId}>
      <div className={styles.header}>
        <h3 className={styles.label} id={labelId}>
          Description
        </h3>
        <button
          className={styles.previewToggle}
          type="button"
          aria-pressed={mode === "preview"}
          aria-controls={`${baseId}-panel`}
          onClick={togglePreview}
        >
          Preview
        </button>
      </div>
      <div
        className={styles.panel}
        id={`${baseId}-panel`}
        role={mode === "preview" ? "region" : undefined}
        aria-label={mode === "preview" ? "Description preview" : undefined}
      >
        {mode === "write" ? (
          <>
            <div className={styles.toolbar} role="toolbar" aria-label="Markdown formatting">
              <button type="button" disabled={disabled} onClick={() => prefixSelectedLines("## ")}>
                Heading
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => replaceSelection("**", "**", "bold text")}
              >
                Bold
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => replaceSelection("*", "*", "italic text")}
              >
                Italic
              </button>
              <button type="button" disabled={disabled} onClick={() => prefixSelectedLines("- ")}>
                List
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => replaceSelection("[", "](https://)", "link text")}
              >
                Link
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => replaceSelection("`", "`", "code")}
              >
                Code
              </button>
            </div>
            <textarea
              ref={textareaRef}
              className={styles.textarea}
              aria-labelledby={labelId}
              aria-describedby={helpId}
              value={value}
              maxLength={TASK_DESCRIPTION_MAX_LENGTH}
              rows={6}
              placeholder="Add context, checklists, or links…"
              disabled={disabled}
              onChange={(event) => onChange(event.target.value)}
            />
            <p className={styles.help} id={helpId}>
              <span>
                Markdown supported: **bold**, lists, links, and code. HTML is not rendered.
              </span>
              {remaining <= 500 ? <span>{remaining} characters left</span> : null}
            </p>
          </>
        ) : value.trim() === "" ? (
          <p className={styles.empty}>No description yet.</p>
        ) : (
          <MarkdownContent source={value} />
        )}
      </div>
    </section>
  );
}
