import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { shouldRetry } from "../lib/api/client";
import { AuthScreen } from "../features/auth/AuthScreen";
import { BoardMembersPage } from "../features/boards/BoardMembersPage";
import { BoardOverviewPage } from "../features/boards/BoardOverviewPage";
import { BoardsPage } from "../features/boards/BoardsPage";
import { InvitationPage } from "../features/invitations/InvitationPage";
import { TaskBoardPage } from "../features/tasks/TaskBoardPage";
import { NotFoundPage } from "./NotFoundPage";
import { RequireSession } from "./RequireSession";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: shouldRetry,
        staleTime: 15_000,
      },
    },
  });
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/boards" replace />} />
      <Route path="/login" element={<AuthScreen />} />
      <Route path="/invitations/:token" element={<InvitationPage />} />
      <Route
        path="/boards"
        element={
          <RequireSession>
            <BoardsPage />
          </RequireSession>
        }
      />
      <Route
        path="/boards/:boardId"
        element={
          <RequireSession>
            <TaskBoardPage />
          </RequireSession>
        }
      />
      <Route
        path="/boards/:boardId/settings"
        element={
          <RequireSession>
            <BoardOverviewPage />
          </RequireSession>
        }
      />
      <Route
        path="/boards/:boardId/members"
        element={
          <RequireSession>
            <BoardMembersPage />
          </RequireSession>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export function App() {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
