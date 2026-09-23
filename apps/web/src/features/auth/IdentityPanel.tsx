import { useState } from "react";
import type { AuthResponse, AuthUser } from "./authClient";
import styles from "./AuthScreen.module.scss";

interface IdentityPanelProps {
  user: AuthUser;
  onSignOut: () => Promise<AuthResponse>;
}

const avatarTones = [styles.avatarToneOne, styles.avatarToneTwo, styles.avatarToneThree];
const avatarShapes = [styles.avatarShapeOne, styles.avatarShapeTwo, styles.avatarShapeThree];

function avatarVariant(seed: string | null): number {
  const value = seed ?? "ksat";
  let hash = 0;

  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) % 997;
  }

  return hash % avatarTones.length;
}

export function IdentityPanel({ user, onSignOut }: IdentityPanelProps) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const variant = avatarVariant(user.avatarSeed);
  const initial = user.name.trim().charAt(0).toUpperCase() || "K";

  const handleSignOut = async () => {
    setError(null);
    setIsSigningOut(true);

    try {
      const response = await onSignOut();
      if (response.error !== null) {
        setError("We couldn’t sign you out. Please try again.");
      }
    } catch {
      setError("We couldn’t sign you out. Please try again.");
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <section className={styles.identityPanel} aria-labelledby="identity-heading">
      <div className={`${styles.avatar} ${avatarTones[variant]}`} aria-hidden="true">
        <span>{initial}</span>
        <i className={avatarShapes[variant]} />
      </div>
      <p className={styles.identityEyebrow}>Identity ready</p>
      <h2 id="identity-heading">Welcome, {user.name}.</h2>
      <p className={styles.identityEmail}>{user.email}</p>
      <p className={styles.identityDescription}>
        Your workspace is ready when you are. We&apos;ll keep this session on this device.
      </p>
      {error !== null ? (
        <p className={styles.errorSummary} role="alert">
          {error}
        </p>
      ) : null}
      <button
        className={styles.secondaryButton}
        type="button"
        onClick={() => void handleSignOut()}
        disabled={isSigningOut}
      >
        {isSigningOut ? "Signing out…" : "Sign out"}
      </button>
    </section>
  );
}
