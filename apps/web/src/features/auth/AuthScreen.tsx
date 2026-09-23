import { useState } from "react";
import { authClient, type AuthResponse, type AuthSession } from "./authClient";
import { AuthForm, type AuthMode } from "./AuthForm";
import { IdentityPanel } from "./IdentityPanel";
import type { SignInValues, SignUpValues } from "./authSchemas";
import styles from "./AuthScreen.module.scss";

const modes: Array<{ value: AuthMode; label: string }> = [
  { value: "sign-up", label: "Create account" },
  { value: "sign-in", label: "Log in" },
];

type FormValues = SignUpValues | SignInValues;

function isSignUpValues(values: FormValues): values is SignUpValues {
  return "name" in values;
}

export function AuthScreen() {
  const sessionState = authClient.useSession();
  const [mode, setMode] = useState<AuthMode>("sign-up");
  const [localSession, setLocalSession] = useState<AuthSession | null>(null);
  const [hasSignedOut, setHasSignedOut] = useState(false);

  const session = hasSignedOut ? null : (localSession ?? sessionState.data ?? null);

  if (sessionState.isPending && localSession === null) {
    return (
      <main className={styles.authPage} aria-busy="true">
        <div className={styles.loadingCard} role="status" aria-live="polite">
          <span className={styles.loadingMark} aria-hidden="true">
            K
          </span>
          <p>Restoring your session…</p>
        </div>
      </main>
    );
  }

  if (session !== null) {
    return (
      <main className={styles.authPage}>
        <div className={styles.authCard}>
          <AuthBrand />
          <IdentityPanel
            user={session.user}
            onSignOut={async () => {
              const response = await authClient.signOut();
              if (response.error === null) {
                setLocalSession(null);
                setHasSignedOut(true);
              }
              return response;
            }}
          />
        </div>
        <AuthFooter />
      </main>
    );
  }

  return (
    <main className={styles.authPage}>
      <div className={styles.authCard}>
        <AuthBrand />
        <div className={styles.headingGroup}>
          <h1>Welcome to the Collective</h1>
          <p>
            {mode === "sign-up"
              ? "Create your profile and begin shaping a more thoughtful todo list."
              : "Sign in to return to your todo list and shared work."}
          </p>
        </div>
        <div className={styles.modeSwitch} role="tablist" aria-label="Account access">
          {modes.map((item) => (
            <button
              className={item.value === mode ? styles.modeButtonActive : styles.modeButton}
              key={item.value}
              type="button"
              role="tab"
              aria-selected={item.value === mode}
              onClick={() => setMode(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <AuthForm
          key={mode}
          mode={mode}
          sessionError={sessionState.error !== undefined && sessionState.error !== null}
          onSubmit={async (values) => {
            const response: AuthResponse = isSignUpValues(values)
              ? await authClient.signUp.email(values)
              : await authClient.signIn.email(values);
            if (response.error === null && response.session !== null) {
              setHasSignedOut(false);
              setLocalSession(response.session);
            }
            return response;
          }}
        />
      </div>
      <AuthFooter />
    </main>
  );
}

function AuthBrand() {
  return (
    <header className={styles.brandLockup}>
      <span className={styles.brandName}>Ksat</span>
      <span className={styles.brandDivider} aria-hidden="true">
        /
      </span>
      <span className={styles.brandDescriptor}>Your todo list</span>
    </header>
  );
}

function AuthFooter() {
  return <footer className={styles.authFooter}>© 2027 Ksat</footer>;
}
