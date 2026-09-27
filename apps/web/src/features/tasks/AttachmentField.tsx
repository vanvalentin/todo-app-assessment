import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { Attachment } from "@ksat/contracts";
import {
  attachmentContentUrl,
  deleteTaskAttachment,
  fetchTaskAttachments,
  uploadTaskAttachment,
} from "../../lib/api/attachments";
import { queryKeys } from "../../lib/api/queryKeys";
import styles from "./AttachmentField.module.scss";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function typeLabel(mediaType: string): string {
  return mediaType.split("/").at(-1)?.toUpperCase() ?? "FILE";
}
interface StagedTile {
  readonly kind: "staged";
  readonly key: string;
  readonly filename: string;
  readonly mediaType: string;
  readonly byteSize: number;
}
interface SavedTile extends Attachment {
  readonly kind: "saved";
}
type Tile = StagedTile | SavedTile;
export interface AttachmentFieldProps {
  readonly taskId?: string;
  readonly files: readonly File[];
  readonly onFilesChange: (files: readonly File[]) => void;
  readonly disabled?: boolean;
}
export function AttachmentField({
  taskId,
  files,
  onFilesChange,
  disabled = false,
}: AttachmentFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const key = queryKeys.taskAttachments(taskId ?? "new");
  const list = useQuery({
    queryKey: key,
    queryFn: () => fetchTaskAttachments(taskId ?? "", { limit: 50 }),
    enabled: taskId !== undefined,
  });
  const upload = useMutation({
    mutationFn: (file: File) => uploadTaskAttachment(taskId ?? "", file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: key });
    },
  });
  const remove = useMutation({
    mutationFn: (attachment: Attachment) => deleteTaskAttachment(attachment.taskId, attachment.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: key });
    },
  });
  const attachments: Tile[] = (list.data?.items ?? []).map(
    (attachment): SavedTile => ({ ...attachment, kind: "saved" }),
  );
  const staged: Tile[] = files.map(
    (file): StagedTile => ({
      key: `${file.name}-${file.size}-${file.lastModified}`,
      filename: file.name,
      mediaType: file.type || "application/octet-stream",
      byteSize: file.size,
      kind: "staged",
    }),
  );
  const rows = [...attachments, ...staged];
  const total =
    attachments.reduce((sum, item) => sum + item.byteSize, 0) +
    files.reduce((sum, file) => sum + file.size, 0);
  const addFiles = (next: FileList | null) => {
    if (!next) return;
    const selected = [...next];
    if (taskId === undefined) onFilesChange([...files, ...selected]);
    else
      selected.forEach((file) => {
        setError(null);
        upload.mutate(file, {
          onError: () => setError(`Could not upload ${file.name}. Try again.`),
        });
      });
    if (inputRef.current) inputRef.current.value = "";
  };
  return (
    <section className={styles.section} aria-labelledby="attachments-heading">
      <div className={styles.heading}>
        <h3 id="attachments-heading">Attached specs &amp; files ({rows.length})</h3>
        <span>{formatBytes(total)} / 50 MB cap</span>
      </div>
      {list.isPending && taskId ? <p className={styles.state}>Loading attachments…</p> : null}
      {list.isError ? (
        <p className={styles.error} role="alert">
          Could not load attachments.{" "}
          <button type="button" onClick={() => void list.refetch()}>
            Retry
          </button>
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.tiles}>
        {rows.map((item) =>
          item.kind === "staged" ? (
            <div className={styles.tile} key={item.key}>
              <span className={styles.badge}>{typeLabel(item.mediaType)}</span>
              <span className={styles.details}>
                <strong title={item.filename}>{item.filename}</strong>
                <small>{formatBytes(item.byteSize)}</small>
              </span>
              <button
                type="button"
                className={styles.remove}
                aria-label={`Remove ${item.filename}`}
                onClick={() =>
                  onFilesChange(
                    files.filter(
                      (file) => `${file.name}-${file.size}-${file.lastModified}` !== item.key,
                    ),
                  )
                }
              >
                ×
              </button>
            </div>
          ) : (
            <div className={styles.tile} key={item.id}>
              <span className={styles.badge}>{typeLabel(item.mediaType)}</span>
              <span className={styles.details}>
                <strong title={item.originalFilename}>{item.originalFilename}</strong>
                <small>{formatBytes(item.byteSize)}</small>
              </span>
              <a
                className={styles.open}
                href={attachmentContentUrl(item.taskId, item.id)}
                target="_blank"
                rel="noreferrer"
              >
                Open
              </a>
              <button
                type="button"
                className={styles.remove}
                aria-label={`Remove ${item.originalFilename}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate(item)}
              >
                ×
              </button>
            </div>
          ),
        )}
        <button
          type="button"
          className={styles.upload}
          disabled={disabled || upload.isPending}
          onClick={() => inputRef.current?.click()}
        >
          ＋ Upload file…
        </button>
      </div>
      <input
        ref={inputRef}
        className={styles.input}
        type="file"
        multiple={taskId === undefined}
        onChange={(event) => addFiles(event.target.files)}
        disabled={disabled}
        aria-label="Upload file"
      />
    </section>
  );
}
