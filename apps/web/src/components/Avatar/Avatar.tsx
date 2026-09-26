import { createAvatar } from "@dicebear/core";
import * as shapes from "@dicebear/shapes";
import { useMemo } from "react";
import styles from "./Avatar.module.scss";

interface AvatarProps {
  /** The server-generated seed; avatars are rendered locally, never fetched. */
  seed: string;
  name: string;
  size?: number;
  /** Decorative avatars sit next to a visible name (stacks, rows). */
  decorative?: boolean;
}

export function Avatar({ seed, name, size = 32, decorative = false }: AvatarProps) {
  const dataUri = useMemo(() => createAvatar(shapes, { seed, size }).toDataUri(), [seed, size]);

  return (
    <img
      className={styles.avatar}
      src={dataUri}
      width={size}
      height={size}
      style={{ height: `${size}px`, width: `${size}px` }}
      alt={decorative ? "" : `${name}'s generated avatar`}
    />
  );
}
