import { Link } from "react-router";
import { AppShell } from "../components/AppShell/AppShell";
import styles from "./App.module.scss";

export function NotFoundPage() {
  return (
    <AppShell>
      <section className={styles.statePanel} aria-labelledby="not-found-heading">
        <p className={styles.stateEyebrow}>Error 404</p>
        <h1 id="not-found-heading">We couldn’t find that page</h1>
        <p className={styles.stateDescription}>
          The address you opened is not part of this workspace yet. Board and membership screens
          live under <span className={styles.stateCode}>/boards</span>.
        </p>
        <Link className={styles.stateAction} to="/boards">
          Go to boards
        </Link>
      </section>
    </AppShell>
  );
}
