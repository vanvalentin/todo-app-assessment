import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";
import plusIcon from "../../assets/boards/plus-white.svg";
import { useSession } from "../../features/auth/useSession";
import { UserMenu } from "./UserMenu";
import styles from "./AppShell.module.scss";

interface AppShellProps {
  children: ReactNode;
  /** Supplied by a board screen so the header CTA opens that board's task dialog. */
  onNewTask?: ((trigger: HTMLButtonElement) => void) | undefined;
}

/** Application frame shared by every screen: editorial header, main landmark, footer. */
export function AppShell({ children, onNewTask }: AppShellProps) {
  const { session } = useSession();

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main-content">
        Skip to content
      </a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brandGroup}>
            <Link className={styles.brand} to="/boards">
              <span className={styles.brandName}>Ksat</span>
              <span className={styles.brandKicker}>Studio</span>
            </Link>
            <span className={styles.divider} aria-hidden="true" />
            <nav aria-label="Primary">
              <ul className={styles.navList}>
                <li>
                  <NavLink
                    to="/boards"
                    className={({ isActive }) => (isActive ? styles.navLinkActive : styles.navLink)}
                  >
                    Boards
                  </NavLink>
                </li>
                <li>
                  <span className={styles.navLinkDisabled} aria-disabled="true">
                    My Tasks
                    <span className="visually-hidden"> — arrives in a later phase</span>
                  </span>
                </li>
                <li>
                  <span className={styles.navLinkDisabled} aria-disabled="true">
                    Archive
                    <span className="visually-hidden"> — arrives in a later phase</span>
                  </span>
                </li>
              </ul>
            </nav>
          </div>

          <div className={styles.headerControls}>
            <span className={styles.syncPill} aria-hidden="true">
              <span className={styles.syncDot} />
              Synced
            </span>
            {onNewTask === undefined ? (
              <button
                className={styles.deferredAction}
                type="button"
                disabled
                aria-label="New Task — open a board to add tasks"
                title="Open a board to add tasks."
              >
                <img src={plusIcon} alt="" width={9.333} height={9.333} />
                <span>New Task</span>
              </button>
            ) : (
              <button
                className={styles.deferredAction}
                data-enabled="true"
                type="button"
                onClick={(event) => onNewTask(event.currentTarget)}
              >
                <img src={plusIcon} alt="" width={9.333} height={9.333} />
                <span>New Task</span>
              </button>
            )}
            {session === null ? (
              <Link className={styles.sessionLink} to="/login">
                Log in
              </Link>
            ) : (
              <UserMenu user={session.user} />
            )}
          </div>
        </div>
      </header>

      <main className={styles.main} id="main-content">
        {children}
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span className={styles.footerBrand}>Ksat</span>
          <span className={styles.footerMeta}>© 2027 Ksat. Crafted with mindful intention.</span>
        </div>
      </footer>
    </div>
  );
}
