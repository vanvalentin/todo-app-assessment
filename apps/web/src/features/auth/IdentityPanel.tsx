import { createAvatar } from "@dicebear/core";
import * as shapes from "@dicebear/shapes";
import { useState } from "react";
import type { AuthResponse, AuthUser } from "./authClient";
import styles from "./AuthScreen.module.scss";

interface IdentityPanelProps {
  user: AuthUser;
  onSignOut: () => Promise<AuthResponse>;
}

export function IdentityPanel({ user, onSignOut }: IdentityPanelProps) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avatar = createAvatar(shapes, {
    seed: user.avatarSeed ?? user.id,
    size: 80,
  }).toDataUri();

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
      <img className={styles.avatar} src={avatar} alt={`${user.name}'s generated avatar`} />
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
