import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api, setUnauthorizedHandler } from "./api";
import type { User } from "./types";
import { Logo } from "./ui";

interface AuthState {
  user: User | null;
  ready: boolean;
  signIn: (mode: "login" | "register", email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signOutAll: () => Promise<void>;
}
const Ctx = createContext<AuthState>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null)); // any 401 from the API sends the person to the login page
    api.get<{ user: User }>("/api/auth/me").then((r) => setUser(r.user)).catch(() => setUser(null)).finally(() => setReady(true));
  }, []);

  const signIn: AuthState["signIn"] = async (mode, email, password) => {
    const r = await api.post<{ user: User }>(`/api/auth/${mode}`, { email, password });
    setUser(r.user);
  };
  const signOut = async () => { await api.post("/api/auth/logout"); setUser(null); };
  const signOutAll = async () => { await api.post("/api/auth/logout-all"); setUser(null); };

  return <Ctx.Provider value={{ user, ready, signIn, signOut, signOutAll }}>{children}</Ctx.Provider>;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <div className="grid min-h-screen place-items-center"><Logo className="animate-pulse" /></div>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}
