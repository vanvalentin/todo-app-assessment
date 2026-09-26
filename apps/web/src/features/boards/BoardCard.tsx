import type { BoardSummary } from "@ksat/contracts";
import { Link } from "react-router";
import arrowIcon from "../../assets/boards/open-board-arrow.svg";
import settingsIcon from "../../assets/boards/board-settings.svg";
import { Avatar } from "../../components/Avatar/Avatar";
import { RoleChip } from "../../components/RoleChip/RoleChip";
import { formatRelativeTime } from "../../lib/format";
import styles from "./BoardCard.module.scss";

const AVATAR_PREVIEW_LIMIT = 3;

interface BoardCardProps {
  board: BoardSummary;
  /** Resolved from the bounded member preview; null when the owner is not in it. */
  ownerName: string | null;
}

export function BoardCard({ board, ownerName }: BoardCardProps) {
  const titleId = `board-title-${board.id}`;
  const preview = board.memberPreview.slice(0, AVATAR_PREVIEW_LIMIT);
  const hiddenMembers = Math.max(board.memberCount - preview.length, 0);

  return (
    <article className={styles.card} aria-labelledby={titleId}>
      <div className={styles.cardTop}>
        <RoleChip role={board.role} />
        <Link
          className={styles.iconLink}
          to={`/boards/${board.id}/members`}
          aria-label={`Members and access for ${board.name}`}
          title="Members & access"
        >
          <img src={settingsIcon} alt="" width={15.075} height={15} />
        </Link>
      </div>

      <h2 className={styles.title} id={titleId}>
        <Link className={styles.titleLink} to={`/boards/${board.id}`}>
          {board.name}
        </Link>
      </h2>

      <p className={styles.description}>
        {board.description ?? "No description has been added to this board yet."}
      </p>

      <div className={styles.footer}>
        <ul className={styles.avatars}>
          {preview.map((member) => (
            <li className={styles.avatarItem} key={member.id}>
              <Avatar seed={member.avatarSeed} name={member.name} size={28} decorative />
            </li>
          ))}
          {hiddenMembers > 0 ? (
            <li className={styles.avatarOverflow} aria-hidden="true">
              +{hiddenMembers}
            </li>
          ) : null}
        </ul>
        <p className={styles.updated}>
          <span>Updated {formatRelativeTime(board.updatedAt)}</span>
          {ownerName === null ? null : <span className={styles.owner}>by {ownerName}</span>}
        </p>
      </div>

      <Link className={styles.openLink} to={`/boards/${board.id}`}>
        Open Board
        <img src={arrowIcon} alt="" width={10} height={10} />
      </Link>

      <span className="visually-hidden">
        {board.memberCount} {board.memberCount === 1 ? "member" : "members"} on this board.
      </span>
    </article>
  );
}
