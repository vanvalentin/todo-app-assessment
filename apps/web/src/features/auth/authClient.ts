import { createAuthClient } from "better-auth/react";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  avatarSeed: string | null;
}

export interface AuthSession {
  user: AuthUser;
}

export interface AuthError {
  code: string | null;
  status: number | null;
}

export interface AuthResponse {
  error: AuthError | null;
  session: AuthSession | null;
}

export interface AuthSessionState {
  data: AuthSession | null | undefined;
  error: unknown;
  isPending: boolean;
}

export interface AuthClientBoundary {
  useSession: () => AuthSessionState;
  signUp: {
    email: (input: { name: string; email: string; password: string }) => Promise<AuthResponse>;
  };
  signIn: {
    email: (input: { email: string; password: string }) => Promise<AuthResponse>;
  };
  signOut: () => Promise<AuthResponse>;
}

const officialAuthClient = createAuthClient({ baseURL: "/api/v1/auth" });

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function normalizeUser(value: unknown): AuthUser | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = stringValue(value.id);
  const name = stringValue(value.name);
  const email = stringValue(value.email);

  if (id === null || name === null || email === null) {
    return null;
  }

  return {
    id,
    name,
    email,
    image: stringValue(value.image),
    avatarSeed: stringValue(value.avatarSeed),
  };
}

export function normalizeSession(value: unknown): AuthSession | null {
  if (!isRecord(value)) {
    return null;
  }

  const user = normalizeUser(value.user);
  return user === null ? null : { user };
}

function normalizeResponse(value: unknown): AuthResponse {
  if (!isRecord(value)) {
    return { error: null, session: null };
  }

  const errorValue = isRecord(value.error) ? value.error : null;
  const status = errorValue === null ? null : numberValue(errorValue.status);
  const statusCode = errorValue === null ? null : numberValue(errorValue.statusCode);

  return {
    error:
      errorValue === null
        ? null
        : {
            code: stringValue(errorValue.code),
            status: status ?? statusCode,
          },
    session: normalizeSession(value.data),
  };
}

export const authClient: AuthClientBoundary = {
  useSession: () => {
    const state = officialAuthClient.useSession();
    return {
      data: normalizeSession(state.data),
      error: "error" in state ? state.error : undefined,
      isPending: state.isPending,
    };
  },
  signUp: {
    email: async (input) => normalizeResponse(await officialAuthClient.signUp.email(input)),
  },
  signIn: {
    email: async (input) => normalizeResponse(await officialAuthClient.signIn.email(input)),
  },
  signOut: async () => normalizeResponse(await officialAuthClient.signOut()),
};
