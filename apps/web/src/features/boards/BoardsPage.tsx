import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { NetworkError, UnexpectedResponseError, type ApiError } from "../../lib/api/client";
import { fetchBoards } from "../../lib/api/boards";
import { queryKeys } from "../../lib/api/queryKeys";
import { AppShell } from "../../components/AppShell/AppShell";
import newBoardPlus from "../../assets/boards/new-board-plus.svg";
import plusIcon from "../../assets/boards/plus-white.svg";
import { useSession } from "../auth/useSession";
import { BoardCard } from "./BoardCard";
import { CreateBoardDialog } from "./CreateBoardDialog";
import styles from "./BoardsPage.module.scss";

const SKELETON_CARDS = 6;

function boardsErrorMessage(error: unknown): string {
  if (error instanceof NetworkError) {
    return "We couldn’t reach Ksat. Check your connection and try again.";
  }
  if (error instanceof UnexpectedResponseError) {
    return "The boards list came back in an unexpected shape. Please retry.";
  }
  const status = (error as ApiError).status;
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  return "We couldn’t load your boards. Please retry.";
}

export function BoardsPage() {
  const { session } = useSession();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const createTriggerRef = useRef<HTMLButtonElement | null>(null);
  const openCreate = (trigger: HTMLButtonElement) => {
    createTriggerRef.current = trigger;
    setIsCreateOpen(true);
  };
  const closeCreate = useCallback(() => {
    setIsCreateOpen(false);
    requestAnimationFrame(() => createTriggerRef.current?.focus());
  }, []);
  const boardsQuery = useInfiniteQuery({
    queryKey: queryKeys.boards(),
    queryFn: ({ pageParam, signal }) => fetchBoards({ cursor: pageParam, signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const boards = boardsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const currentUserId = session?.user.id ?? "";
  const currentUserName = session?.user.name ?? null;
  const isEmpty = !boardsQuery.isPending && !boardsQuery.isError && boards.length === 0;

  return (
    <AppShell>
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Boards</h1>
          <button
            className={styles.createButton}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={isCreateOpen}
            onClick={(event) => openCreate(event.currentTarget)}
          >
            <img src={plusIcon} alt="" width={9.333} height={9.333} />
            <span>Create New Board</span>
          </button>
        </header>

        {boardsQuery.isError ? (
          <section className={styles.statePanel} aria-labelledby="boards-error-heading">
            <p className={styles.stateEyebrow}>Boards unavailable</p>
            <h2 className={styles.stateTitle} id="boards-error-heading">
              We couldn’t load your boards
            </h2>
            <p className={styles.stateText} role="alert">
              {boardsErrorMessage(boardsQuery.error)}
            </p>
            <button
              className={styles.retryButton}
              type="button"
              disabled={boardsQuery.isFetching}
              onClick={() => void boardsQuery.refetch()}
            >
              {boardsQuery.isFetching ? "Retrying…" : "Retry"}
            </button>
          </section>
        ) : null}

        {boardsQuery.isPending ? (
          <div className={styles.loading} role="status" aria-live="polite">
            <span className="visually-hidden">Loading boards…</span>
            <ul className={styles.grid} aria-hidden="true">
              {Array.from({ length: SKELETON_CARDS }, (_, index) => (
                <li className={styles.skeletonCard} key={index} />
              ))}
            </ul>
          </div>
        ) : null}

        {isEmpty ? (
          <section className={styles.statePanel} aria-labelledby="boards-empty-heading">
            <p className={styles.stateEyebrow}>No boards yet</p>
            <h2 className={styles.stateTitle} id="boards-empty-heading">
              Create your first board
            </h2>
            <p className={styles.stateText}>
              Start a board yourself, or join an existing workspace through an invitation sent to
              <strong> {session?.user.email ?? "your email"}</strong>.
            </p>
          </section>
        ) : null}

        {!boardsQuery.isPending && !boardsQuery.isError ? (
          <ul className={styles.grid}>
            {boards.map((board) => (
              <li className={styles.gridItem} key={board.id}>
                <BoardCard
                  board={board}
                  ownerName={
                    board.memberPreview.find((member) => member.id === board.ownerId)?.name ??
                    (board.ownerId === currentUserId ? currentUserName : null)
                  }
                />
              </li>
            ))}
            <li className={styles.gridItem}>
              <button
                className={styles.dashedCard}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={isCreateOpen}
                onClick={(event) => openCreate(event.currentTarget)}
              >
                <span className={styles.dashedIcon} aria-hidden="true">
                  <img src={newBoardPlus} alt="" width={16.333} height={16.333} />
                </span>
                <p className={styles.dashedTitle}>Create a new board</p>
                <p className={styles.dashedText}>
                  Set up a sprint, production schedule, or shared planning space.
                </p>
              </button>
            </li>
          </ul>
        ) : null}

        {boardsQuery.hasNextPage ? (
          <div className={styles.loadMore}>
            <button
              className={styles.loadMoreButton}
              type="button"
              disabled={boardsQuery.isFetchingNextPage}
              onClick={() => void boardsQuery.fetchNextPage()}
            >
              {boardsQuery.isFetchingNextPage ? "Loading…" : "Load more boards"}
            </button>
          </div>
        ) : null}

        {boards.length > 0 && boardsQuery.isFetching && !boardsQuery.isFetchingNextPage ? (
          <p className={styles.refreshing} role="status">
            Refreshing boards…
          </p>
        ) : null}
      </div>
      {isCreateOpen ? <CreateBoardDialog onClose={closeCreate} /> : null}
    </AppShell>
  );
}
