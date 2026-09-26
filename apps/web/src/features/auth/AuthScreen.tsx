import { useQueryClient } from "@tanstack/react-query";
import { type KeyboardEvent, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router";
import { authClient, type AuthResponse, type AuthSession } from "./authClient";
import { AuthForm, type AuthMode } from "./AuthForm";
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

const supportedRedirectPath =
  /^(?:\/boards(?:\/[^/\\?#]+(?:\/members)?)?|\/invitations\/[^/\\?#]+)$/;

function decodeRedirect(value: string): string | null {
  let decoded = value;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return null;
    }
    if (next === decoded) return decoded;
    decoded = next;
  }
  return null;
}

/** Only same-origin, supported application paths may be used as a post-login destination. */
function safeRedirect(value: string | null): string | null {
  if (value === null || value.includes("\\")) return null;
  const decoded = decodeRedirect(value);
  if (decoded === null || decoded.includes("\\") || decoded.startsWith("//")) return null;

  let destination: URL;
  try {
    destination = new URL(value, window.location.origin);
  } catch {
    return null;
  }

  if (destination.origin !== window.location.origin) return null;
  const decodedPath = decodeRedirect(destination.pathname);
  if (
    decodedPath === null ||
    decodedPath.includes("\\") ||
    destination.pathname === "/login" ||
    destination.pathname.startsWith("/login/") ||
    !supportedRedirectPath.test(destination.pathname) ||
    !supportedRedirectPath.test(decodedPath)
  ) {
    return null;
  }

  return `${destination.pathname}${destination.search}${destination.hash}`;
}

export function AuthScreen() {
  const sessionState = authClient.useSession();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [signedInSession, setSignedInSession] = useState<AuthSession | null>(null);
  const [mode, setMode] = useState<AuthMode>(
    searchParams.get("mode") === "sign-in" ? "sign-in" : "sign-up",
  );
  const radioRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const redirectTarget = safeRedirect(searchParams.get("redirect")) ?? "/boards";

  const selectMode = (value: AuthMode) => {
    setMode(value);
    const index = modes.findIndex((item) => item.value === value);
    radioRefs.current[index]?.focus();
  };

  const handleModeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = modes.findIndex((item) => item.value === mode);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % modes.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + modes.length) % modes.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = modes.length - 1;
    }
    if (nextIndex !== null && nextIndex !== currentIndex) {
      event.preventDefault();
      selectMode(modes[nextIndex].value);
    }
  };

  const session = sessionState.data ?? signedInSession;

  if (sessionState.isPending && session === null) {
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

  // A restored or freshly created session never stays on the sign-in screen.
  if (session !== null) {
    return <Navigate to={redirectTarget} replace />;
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
        <div
          className={styles.modeSwitch}
          role="radiogroup"
          aria-label="Account access"
          onKeyDown={handleModeKeyDown}
        >
          {modes.map((item, index) => (
            <button
              className={item.value === mode ? styles.modeButtonActive : styles.modeButton}
              key={item.value}
              type="button"
              role="radio"
              aria-checked={item.value === mode}
              tabIndex={item.value === mode ? 0 : -1}
              ref={(element) => {
                radioRefs.current[index] = element;
              }}
              onClick={() => selectMode(item.value)}
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
              // Nothing cached for the anonymous visitor may be reused by this identity.
              queryClient.clear();
              setSignedInSession(response.session);
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
