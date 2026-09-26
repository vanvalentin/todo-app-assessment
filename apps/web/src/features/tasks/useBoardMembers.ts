import { useEffect, useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { UserPreview } from "@ksat/contracts";
import { fetchBoardMembers } from "../../lib/api/boards";
import { queryKeys } from "../../lib/api/queryKeys";

/** The picker never needs to page indefinitely; this cap is far past any real roster. */
const MAX_MEMBER_PAGES = 5;

export interface BoardMemberOption extends UserPreview {
  readonly role: "ADMIN" | "MANAGER" | "CONTRIBUTOR";
}

/**
 * Loads every board member for the assignee/reporter pickers, paging automatically
 * up to a bound. A person already set on the task (assignee or reporter) is always
 * shown even if a later page has not loaded yet, so the pill never goes blank.
 */
export function useBoardMembers(boardId: string, enabled = true) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.boardMembers(boardId),
    queryFn: ({ pageParam, signal }) => fetchBoardMembers(boardId, { cursor: pageParam, signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage, allPages) =>
      allPages.length >= MAX_MEMBER_PAGES ? undefined : lastPage.nextCursor,
    enabled: enabled && boardId.length > 0,
  });

  const members = useMemo<readonly BoardMemberOption[]>(
    () =>
      (query.data?.pages.flatMap((page) => page.items) ?? []).map((member) => ({
        id: member.user.id,
        name: member.user.name,
        avatarSeed: member.user.avatarSeed,
        role: member.role,
      })),
    [query.data],
  );

  // Auto-fetch remaining pages up to the bound so the picker does not need its own
  // "load more" affordance; a roster this large is already an edge case.
  useEffect(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);

  return { members, isPending: query.isPending, isError: query.isError };
}

/** Ensures a person already on the task is selectable even if their page has not loaded. */
export function withKnownPerson(
  members: readonly BoardMemberOption[],
  known: UserPreview | null | undefined,
): readonly BoardMemberOption[] {
  if (!known || members.some((member) => member.id === known.id)) return members;
  return [...members, { ...known, role: "CONTRIBUTOR" as const }];
}
