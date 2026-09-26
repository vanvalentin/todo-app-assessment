import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { authClient, type AuthUser } from "../../features/auth/authClient";
import { Avatar } from "../Avatar/Avatar";
import styles from "./AppShell.module.scss";

interface UserMenuProps {
  user: AuthUser;
}

/** Avatar disclosure plus ordinary tab-navigable account actions. */
export function UserMenu({ user }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current !== null && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const open = () => setIsOpen(true);

  const handleSignOut = async () => {
    setError(null);
    setIsSigningOut(true);
    try {
      const response = await authClient.signOut();
      if (response.error !== null) {
        setError("We couldn’t sign you out. Please try again.");
        return;
      }
      // Nothing cached for the previous identity may survive the sign-out.
      queryClient.clear();
      setIsOpen(false);
      await navigate("/login", { replace: true });
    } catch {
      setError("We couldn’t sign you out. Please try again.");
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className={styles.userMenu} ref={containerRef}>
      <button
        ref={buttonRef}
        className={styles.avatarButton}
        type="button"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => (isOpen ? setIsOpen(false) : open())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !isOpen) {
            event.preventDefault();
            open();
          }
        }}
      >
        <Avatar seed={user.avatarSeed ?? user.id} name={user.name} size={32} decorative />
        <span className="visually-hidden">Account menu for {user.name}</span>
      </button>

      {isOpen ? (
        <div className={styles.menu} id={menuId} aria-label="Account">
          <p className={styles.menuIdentity}>
            <span className={styles.menuName}>{user.name}</span>
            <span className={styles.menuEmail}>{user.email}</span>
          </p>
          <button
            className={styles.menuItem}
            type="button"
            onClick={() => void handleSignOut()}
            disabled={isSigningOut}
          >
            {isSigningOut ? "Signing out…" : "Sign out"}
          </button>
          {error !== null ? (
            <p className={styles.menuError} role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
