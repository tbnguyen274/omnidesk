"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { apiClient } from "@/lib/api-client";
import type { CurrentUser } from "@/lib/api-types";

const TOKEN_STORAGE_KEY = "omnidesk.accessToken";

interface AuthContextType {
  token: string | null;
  currentUser: CurrentUser | null;
  authLoading: boolean;
  authError: string | null;
  handleLogin: (email: string, password: string) => Promise<void>;
  handleLogout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);

    if (!storedToken) {
      setTimeout(() => {
        setAuthLoading(false);
      }, 0);
      return;
    }

    apiClient
      .me(storedToken)
      .then((user) => {
        setToken(storedToken);
        setCurrentUser(user);
      })
      .catch(() => {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
        setToken(null);
        setAuthError("Session expired. Please log in again.");
      })
      .finally(() => setAuthLoading(false));
  }, []);

  async function handleLogin(email: string, password: string) {
    setAuthError(null);
    setAuthLoading(true);

    try {
      const data = await apiClient.login(email, password);
      // Tokens are now handled via HttpOnly Cookies or localStorage depending on setup
      // We keep dummy token for client side checks as per existing code
      const dummyToken = data.accessToken || "cookie-auth"; 
      window.localStorage.setItem(TOKEN_STORAGE_KEY, dummyToken);
      setToken(dummyToken);
      setCurrentUser(data.user);
    } catch (caught) {
      setAuthError(getErrorMessage(caught));
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setCurrentUser(null);
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
