"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { ApiError, apiClient } from "@/lib/api-client";
import type { CurrentUser } from "@/lib/api-types";

const TOKEN_STORAGE_KEY = "omnidesk.accessToken";
const COOKIE_AUTH_MARKER = "cookie-auth";

interface AuthContextType {
  token: string | null;
  currentUser: CurrentUser | null;
  authLoading: boolean;
  authError: string | null;
  handleLogin: (email: string, password: string) => Promise<void>;
  handleLogout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getLoginErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    return "Invalid email or password.";
  }

  return getErrorMessage(error);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  async function restoreSession(sessionMarker: string, hadStoredSession: boolean) {
    try {
      const user = await apiClient.me(sessionMarker);
      window.localStorage.setItem(TOKEN_STORAGE_KEY, sessionMarker);
      setToken(sessionMarker);
      setCurrentUser(user);
      setAuthError(null);
    } catch {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      setToken(null);
      setCurrentUser(null);

      setAuthError(
        hadStoredSession ? "Session expired. Please log in again." : null,
      );
    } finally {
      setTimeout(() => {
        setAuthLoading(false);
      }, 0);
    }
  }

  useEffect(() => {
    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);

    // Session restoration synchronizes cookie/localStorage auth state on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void restoreSession(storedToken ?? COOKIE_AUTH_MARKER, Boolean(storedToken));
  }, []);

  async function handleLogin(email: string, password: string) {
    setAuthError(null);
    setAuthLoading(true);

    try {
      const data = await apiClient.login(email, password);
      window.localStorage.setItem(TOKEN_STORAGE_KEY, COOKIE_AUTH_MARKER);
      setToken(COOKIE_AUTH_MARKER);
      setCurrentUser(data.user);
    } catch (caught) {
      setAuthError(getLoginErrorMessage(caught));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await apiClient.logout();
    } catch {
      // Local logout should still clear the client session if the API is unreachable.
    }

    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setCurrentUser(null);
    setAuthError(null);
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        currentUser,
        authLoading,
        authError,
        handleLogin,
        handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
