import type { BoardSummary } from "@ksat/contracts";
import { Link } from "react-router";
import arrowIcon from "../../assets/boards/open-board-arrow.svg";
import settingsIcon from "../../assets/boards/board-settings.svg";
import { RoleChip } from "../../components/RoleChip/RoleChip";
import styles from "./BoardCard.module.scss";

interface BoardCardProps {
  board: BoardSummary;
}

export function BoardCard({ board }: BoardCardProps) {
  const titleId = `board-title-${board.id}`;

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
