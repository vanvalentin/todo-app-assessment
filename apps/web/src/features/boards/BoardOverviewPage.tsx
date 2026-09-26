import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { Avatar } from "../../components/Avatar/Avatar";
import { AppShell } from "../../components/AppShell/AppShell";
import { RoleChip, roleDescription } from "../../components/RoleChip/RoleChip";
import { ApiError, NetworkError } from "../../lib/api/client";
import { fetchBoard } from "../../lib/api/boards";
import { BoardEditPanel } from "./BoardEditPanel";
import { queryKeys } from "../../lib/api/queryKeys";
import styles from "./BoardOverviewPage.module.scss";

function overviewErrorMessage(error: unknown): string {
  if (error instanceof NetworkError) {
    return "We couldn’t reach Ksat. Check your connection and try again.";
  }
  const status = (error as ApiError).status;
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 404) return "This board does not exist, or you are not a member of it.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  return "We couldn’t load this board. Please retry.";
}

export function BoardOverviewPage() {
  const { boardId = "" } = useParams();
  const boardQuery = useQuery({
    queryKey: queryKeys.board(boardId),
    queryFn: ({ signal }) => fetchBoard(boardId, signal),
    enabled: boardId.length > 0,
  });

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement | null>(null);
  const board = boardQuery.data;
  const notFound = boardQuery.isError && (boardQuery.error as ApiError).status === 404;

  if (notFound) {
    return (
      <AppShell>
        <section className={styles.statePanel} aria-labelledby="board-not-found-heading">
          <p className={styles.stateEyebrow}>Board unavailable</p>
          <h1 className={styles.stateTitle} id="board-not-found-heading">
            We couldn’t find that board
          </h1>
          <p className={styles.stateText}>
            The board may have been removed, or your membership may have ended. Only board members
            can open a board.
          </p>
          <Link className={styles.stateAction} to="/boards">
            Back to boards
          </Link>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link to="/boards">Boards</Link>
          <span aria-hidden="true">/</span>
          <Link to={`/boards/${boardId}`}>{board?.name ?? "Board"}</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Settings</span>
        </nav>

        {boardQuery.isPending ? (
          <div className={styles.loading} role="status" aria-live="polite">
            <span className="visually-hidden">Loading board…</span>
            <div className={styles.skeletonTitle} aria-hidden="true" />
            <div className={styles.skeletonLine} aria-hidden="true" />
          </div>
        ) : null}

        {boardQuery.isError && !notFound ? (
          <section className={styles.statePanel} aria-labelledby="board-error-heading">
            <p className={styles.stateEyebrow}>Board unavailable</p>
            <h1 className={styles.stateTitle} id="board-error-heading">
              We couldn’t load this board
            </h1>
            <p className={styles.stateText} role="alert">
              {overviewErrorMessage(boardQuery.error)}
            </p>
            <button
              className={styles.stateAction}
              type="button"
              disabled={boardQuery.isFetching}
              onClick={() => void boardQuery.refetch()}
            >
              {boardQuery.isFetching ? "Retrying…" : "Retry"}
            </button>
          </section>
        ) : null}

        {board ? (
          <>
            <header className={styles.pageHeader}>
              <div className={styles.headerTop}>
                <div>
                  <h1 className={styles.pageTitle}>{board.name}</h1>
                  <span className={styles.sectionTag} aria-hidden="true">
                    [ board settings ]
                  </span>
                </div>
                {board.role === "ADMIN" ? (
                  <button
                    ref={editButtonRef}
                    className={styles.editButton}
                    type="button"
                    aria-expanded={isEditorOpen}
                    aria-controls="edit-board-panel"
                    onClick={() => setIsEditorOpen(true)}
                  >
                    Edit board
                  </button>
                ) : null}
              </div>
              <p className={styles.description}>
                {board.description ?? "No description has been added to this board yet."}
              </p>
            </header>

            {isEditorOpen && board.role === "ADMIN" ? (
              <BoardEditPanel
                board={board}
                onClose={() => {
                  setIsEditorOpen(false);
                  requestAnimationFrame(() => editButtonRef.current?.focus());
                }}
              />
            ) : null}

            <div className={styles.panels}>
              <section className={styles.panel} aria-labelledby="board-membership-heading">
                <h2 className={styles.panelTitle} id="board-membership-heading">
                  Membership
                </h2>
                <dl className={styles.metaList}>
                  <div className={styles.metaRow}>
                    <dt>Your role</dt>
                    <dd>
                      <RoleChip role={board.role} />
                      <span className={styles.metaNote}>{roleDescription(board.role)}</span>
                    </dd>
                  </div>
                  <div className={styles.metaRow}>
                    <dt>Members</dt>
                    <dd>
                      {board.memberCount} {board.memberCount === 1 ? "member" : "members"}
                      <ul className={styles.avatars}>
                        {board.memberPreview.map((member) => (
                          <li className={styles.avatarItem} key={member.id}>
                            <Avatar
                              seed={member.avatarSeed}
                              name={member.name}
                              size={32}
                              decorative
                            />
                            <span className="visually-hidden">{member.name}</span>
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                </dl>
                <Link className={styles.panelAction} to={`/boards/${board.id}/members`}>
                  Members & access
                </Link>
              </section>

              <section className={styles.panel} aria-labelledby="board-tasks-heading">
                <h2 className={styles.panelTitle} id="board-tasks-heading">
                  Task board
                </h2>
                <p className={styles.panelText}>
                  Columns, task cards, and status moves live on the task board. This screen keeps
                  board metadata, membership, and access controls.
                </p>
                <Link className={styles.panelAction} to={`/boards/${board.id}`}>
                  Open task board
                </Link>
              </section>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
