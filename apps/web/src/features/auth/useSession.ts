import { authClient, type AuthSession } from "./authClient";

export interface SessionState {
  session: AuthSession | null;
  /** True while the cookie-backed session is still being restored. */
  isPending: boolean;
  hasError: boolean;
}

/** Single read of the Better Auth session store shared by guards, shell, and pages. */
export function useSession(): SessionState {
  const state = authClient.useSession();
  return {
    session: state.data ?? null,
    isPending: state.isPending,
    hasError: state.error !== undefined && state.error !== null,
  };
}
