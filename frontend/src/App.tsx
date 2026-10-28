import { useState } from "react";
import { BrowserRouter, Link, NavLink, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, RequireAuth, useAuth } from "./auth";
import { Icon, Logo, ToastProvider } from "./ui";
import { AccountModal } from "./Account";
import AuthPage from "./pages/AuthPage";
import Library from "./pages/Library";
import Albums from "./pages/Albums";
import AlbumDetail from "./pages/AlbumDetail";
import Shared from "./pages/Shared";

function Layout() {
  const { user, signOut } = useAuth();
  const { pathname } = useLocation();
  const [account, setAccount] = useState(false);
  const link = ({ isActive }: { isActive: boolean }) =>
    `inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition duration-200 ${isActive ? "bg-slate-900 text-white shadow" : "text-slate-600 hover:bg-slate-900/5"}`;
  return (
    <>
      <header className="sticky top-0 z-30 h-14 border-b border-slate-200/70 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-2 px-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link to="/" aria-label="Photo Albums home"><Logo compact /></Link>
            <nav className="flex items-center gap-1" aria-label="Main">
              <NavLink to="/" end className={link}><Icon name="image" className="h-4 w-4" />Photos</NavLink>
              <NavLink to="/albums" className={link}><Icon name="layers" className="h-4 w-4" />Albums</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden max-w-48 truncate text-sm text-slate-500 md:inline">{user?.email}</span>
            <button onClick={() => setAccount(true)} aria-label="Account and security" title="Account & security"
              className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-sm font-bold uppercase text-white transition hover:scale-110 hover:shadow-lg hover:shadow-indigo-500/30 active:scale-95">{user?.email[0]}</button>
            <button onClick={signOut} aria-label="Sign out" title="Sign out" className="grid h-9 w-9 place-items-center rounded-full text-slate-600 transition hover:bg-slate-900/5 active:scale-90"><Icon name="logout" className="h-4.5 w-4.5" /></button>
          </div>
        </div>
      </header>
      {account && <AccountModal onClose={() => setAccount(false)} />}
      {/* key = path, so each page fades in when you navigate */}
      <main key={pathname} className="mx-auto max-w-7xl animate-fade-in px-3 py-5 pb-28 sm:px-6"><Outlet /></main>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route path="/s/:token" element={<Shared />} />
            <Route element={<RequireAuth><Layout /></RequireAuth>}>
              <Route index element={<Library />} />
              <Route path="/albums" element={<Albums />} />
              <Route path="/albums/:id" element={<AlbumDetail />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
