import styles from "./App.module.scss";

const foundationItems = [
  {
    title: "Accessible by default",
    description:
      "Semantic structure, keyboard focus, and clear status cues are part of the foundation.",
  },
  {
    title: "Ready for the API",
    description: "The same-origin web shell will connect to the API through the local proxy.",
  },
  {
    title: "Responsive at every size",
    description: "The layout stays readable on a phone, tablet, or wide workspace display.",
  },
];

export function App() {
  return (
    <div className={styles.appShell}>
      <a className={styles.skipLink} href="#main-content">
        Skip to main content
      </a>

      <header className={styles.siteHeader}>
        <a className={styles.brand} href="/" aria-label="Ksat home">
          <span className={styles.brandMark} aria-hidden="true">
            K
          </span>
          <span>
            <span className={styles.brandName}>Ksat</span>
            <span className={styles.brandType}>TODO workspace</span>
          </span>
        </a>
        <span className={styles.phaseBadge}>Phase 1 foundation</span>
      </header>

      <main id="main-content" className={styles.main}>
        <section className={styles.hero} aria-labelledby="welcome-heading">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>A focused place to begin</p>
            <h1 id="welcome-heading">A calm foundation for shared work.</h1>
            <p className={styles.introduction}>
              The Ksat workspace is being prepared for boards, tasks, and thoughtful collaboration.
              This lightweight shell confirms that the web delivery path is ready.
            </p>
            <p className={styles.status} role="status">
              <span className={styles.statusDot} aria-hidden="true" />
              Web foundation is ready
            </p>
          </div>

          <aside className={styles.signalCard} aria-labelledby="signal-heading">
            <p className={styles.cardLabel}>Delivery signal</p>
            <h2 id="signal-heading">A steady start.</h2>
            <p>
              No account or board data is loaded in this placeholder. Product flows will arrive in
              later vertical slices.
            </p>
            <div className={styles.signalLine} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </aside>
        </section>

        <section className={styles.foundation} aria-labelledby="foundation-heading">
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>What is in place</p>
            <h2 id="foundation-heading">Small pieces, deliberately connected.</h2>
          </div>
          <ul className={styles.foundationList}>
            {foundationItems.map((item) => (
              <li className={styles.foundationItem} key={item.title}>
                <span className={styles.itemNumber} aria-hidden="true">
                  ✓
                </span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>Ksat</span>
        <span className={styles.footerMeta}>Web delivery · Local development</span>
      </footer>
    </div>
  );
}
