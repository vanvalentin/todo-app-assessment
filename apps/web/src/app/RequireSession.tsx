import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { AppShell } from "../components/AppShell/AppShell";
import { useSession } from "../features/auth/useSession";
import styles from "./App.module.scss";

interface RequireSessionProps {
  children: ReactNode;
}

/** Resolves the cookie session before rendering protected content. */
export function RequireSession({ children }: RequireSessionProps) {
  const { session, isPending } = useSession();
  const location = useLocation();

  if (isPending && session === null) {
    return <SessionGate />;
  }

  if (session === null) {
    const target = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(target)}`} replace />;
  }

  return <>{children}</>;
}

function SessionGate() {
  return (
    <AppShell>
      <div className={styles.sessionGate} role="status" aria-live="polite">
        <span className={styles.sessionMark} aria-hidden="true">
          K
        </span>
        <p>Restoring your session…</p>
      </div>
    </AppShell>
  );
}
