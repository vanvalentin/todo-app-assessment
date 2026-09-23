import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useState } from "react";
import { useForm } from "react-hook-form";
import type { AuthResponse } from "./authClient";
import { signInSchema, signUpSchema } from "./authSchemas";
import styles from "./AuthScreen.module.scss";

export type AuthMode = "sign-up" | "sign-in";
type FormValues = {
  name?: string;
  email: string;
  password: string;
};

interface AuthFormProps {
  mode: AuthMode;
  sessionError?: boolean;
  onSubmit: (values: FormValues) => Promise<AuthResponse>;
}

function messageForMode(mode: AuthMode, error: AuthResponse["error"]): string {
  if (error?.status === 429) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  return mode === "sign-up"
    ? "We couldn't create your account. Check your details and try again."
    : "We couldn't sign you in. Check your email and password and try again.";
}

export function AuthForm({ mode, sessionError = false, onSubmit }: AuthFormProps) {
  const isSignUp = mode === "sign-up";
  const schema = isSignUp ? signUpSchema : signInSchema;
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onSubmit",
    shouldFocusError: true,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const emailId = useId();
  const passwordId = useId();
  const nameId = useId();
  const formErrorId = useId();
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    setSubmitError(null);
    setShowPassword(false);
    form.clearErrors();
  }, [form, mode]);

  const handleSubmit = async (values: FormValues) => {
    setSubmitError(null);

    try {
      const response = await onSubmit(values);
      if (response.error !== null) {
        setSubmitError(messageForMode(mode, response.error));
      }
    } catch {
      setSubmitError(messageForMode(mode, null));
    }
  };

  const nameError = isSignUp ? errors.name?.message : undefined;
  const emailError = errors.email?.message;
  const passwordError = errors.password?.message;

  return (
    <form
      className={styles.form}
      noValidate
      aria-busy={isSubmitting}
      onSubmit={(event) => void form.handleSubmit(handleSubmit)(event)}
      aria-describedby={submitError === null ? undefined : formErrorId}
    >
      {sessionError ? (
        <p className={styles.notice} role="status">
          We couldn&apos;t restore your session. You can still try signing in below.
        </p>
      ) : null}

      {submitError !== null ? (
        <p className={styles.errorSummary} id={formErrorId} role="alert" aria-live="assertive">
          {submitError}
        </p>
      ) : null}

      {isSignUp ? (
        <div className={styles.field}>
          <label htmlFor={nameId}>Display name</label>
          <input
            {...form.register("name")}
            id={nameId}
            autoComplete="name"
            disabled={isSubmitting}
            aria-invalid={nameError === undefined ? "false" : "true"}
            aria-describedby={nameError === undefined ? undefined : `${nameId}-error`}
          />
          {nameError !== undefined ? (
            <span className={styles.fieldError} id={`${nameId}-error`} role="alert">
              {nameError}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className={styles.field}>
        <label htmlFor={emailId}>Email</label>
        <input
          {...form.register("email")}
          id={emailId}
          type="email"
          autoComplete="email"
          inputMode="email"
          disabled={isSubmitting}
          aria-invalid={emailError === undefined ? "false" : "true"}
          aria-describedby={emailError === undefined ? undefined : `${emailId}-error`}
        />
        {emailError !== undefined ? (
          <span className={styles.fieldError} id={`${emailId}-error`} role="alert">
            {emailError}
          </span>
        ) : null}
      </div>

      <div className={styles.field}>
        <div className={styles.labelRow}>
          <label htmlFor={passwordId}>Password</label>
          <button
            className={styles.passwordToggle}
            type="button"
            disabled={isSubmitting}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((visible) => !visible)}
          >
            {showPassword ? "Hide password" : "Show password"}
          </button>
        </div>
        <input
          {...form.register("password")}
          id={passwordId}
          type={showPassword ? "text" : "password"}
          autoComplete={isSignUp ? "new-password" : "current-password"}
          disabled={isSubmitting}
          aria-invalid={passwordError === undefined ? "false" : "true"}
          aria-describedby={passwordError === undefined ? undefined : `${passwordId}-error`}
        />
        {passwordError !== undefined ? (
          <span className={styles.fieldError} id={`${passwordId}-error`} role="alert">
            {passwordError}
          </span>
        ) : null}
      </div>

      <button className={styles.primaryButton} type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Working…" : isSignUp ? "Create account" : "Log in"}
      </button>
    </form>
  );
}
