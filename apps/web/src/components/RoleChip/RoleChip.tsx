import type { BoardRole } from "@ksat/contracts";
import styles from "./RoleChip.module.scss";

const ROLE_LABELS: Record<BoardRole, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  CONTRIBUTOR: "Contributor",
};

/** Short human label for a board role; the enum value itself is never shown raw. */
export function roleLabel(role: BoardRole): string {
  return ROLE_LABELS[role];
}

const ROLE_DESCRIPTIONS: Record<BoardRole, string> = {
  ADMIN: "Full board access, including destructive board operations.",
  MANAGER: "Manages members, invitations, and board settings.",
  CONTRIBUTOR: "Manages tasks assigned to the board.",
};

export function roleDescription(role: BoardRole): string {
  return ROLE_DESCRIPTIONS[role];
}

const ROLE_CLASS: Record<BoardRole, string> = {
  ADMIN: styles.admin,
  MANAGER: styles.manager,
  CONTRIBUTOR: styles.contributor,
};

interface RoleChipProps {
  role: BoardRole;
}

/**
 * Read-only role badge in the Figma tag slot. The visible label is the state cue, so
 * the meaning never depends on colour alone.
 */
export function RoleChip({ role }: RoleChipProps) {
  return (
    <span className={`${styles.chip} ${ROLE_CLASS[role]}`}>
      <span className={styles.visuallyHidden}>{"Role: "}</span>
      {roleLabel(role)}
    </span>
  );
}
