import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError, errorMessage } from "../api";
import { useAuth } from "../auth";
import { Button, ErrorBanner, Icon, Logo } from "../ui";
import { PasswordHint } from "../Account";

const HERO = [
  { src: "/hero/a.jpg", cls: "left-[4%] top-[8%] h-64 w-48 [--r:-6deg] animate-float", delay: "0s" },
  { src: "/hero/b.jpg", cls: "right-[6%] top-[16%] h-72 w-52 [--r:5deg] animate-float-slow", delay: "0s" },
  { src: "/hero/c.jpg", cls: "left-[20%] bottom-[24%] h-56 w-40 [--r:4deg] animate-float-slow", delay: "0s" },
  { src: "/hero/d.jpg", cls: "right-[22%] bottom-[22%] h-48 w-36 [--r:-5deg] animate-float", delay: "0s" },
];

export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0); // seconds left when the server says "too many attempts"

  useEffect(() => {
    if (wait <= 0) return;
    const t = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearInterval(t);
  }, [wait > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  if (user) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setField(undefined);
    try { await signIn(mode, email, password); navigate(from, { replace: true }); }
    catch (err) {
      setError(errorMessage(err));
      setField(err instanceof ApiError ? err.field : undefined);
      if (err instanceof ApiError && err.status === 429 && err.retryAfter) setWait(err.retryAfter);
    }
    finally { setBusy(false); }
  };

  const input = (name: string) => `mt-1.5 min-h-12 w-full rounded-xl bg-white px-4 ring-1 transition focus:ring-2 ${field === name ? "ring-red-400 focus:ring-red-500" : "ring-slate-200 focus:ring-indigo-500"}`;

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <main className="relative flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm animate-scale-in">
          <Logo className="mb-8 text-lg" />
          <h1 className="text-3xl font-bold tracking-tight">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
          <p className="mb-7 mt-2 text-slate-500">{mode === "login" ? "Sign in to see your photos and albums." : "Upload, organise and share your photos."}</p>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <ErrorBanner message={error} />
            <label className="block text-sm font-medium text-slate-700">Email
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input("email")} placeholder="you@example.com" />
            </label>
            <label className="block text-sm font-medium text-slate-700">Password
              <span className="relative block">
                <input type={show ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password}
                  onChange={(e) => setPassword(e.target.value)} className={`${input("password")} pr-12`} placeholder={mode === "register" ? "At least 10 characters" : "Your password"} />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:text-slate-700"><Icon name="eye" className="h-5 w-5" /></button>
              </span>
              {mode === "register" && <PasswordHint password={password} email={email} />}
            </label>
            <Button type="submit" variant="primary" className="min-h-12 w-full text-base" disabled={busy || wait > 0}>
              {wait > 0 ? `Try again in ${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, "0")}` : busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
          {mode === "login" && (
            <button type="button" onClick={() => { setEmail("demo@example.com"); setPassword("password123"); }}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/60 px-4 py-3 text-sm font-medium text-indigo-700 transition hover:bg-indigo-50 active:scale-[.98]">
              <Icon name="sparkles" className="h-4 w-4" />Fill in the demo login
            </button>
          )}
          <p className="mt-7 text-center text-sm text-slate-500">
            {mode === "login" ? <>New here? <Link className="font-semibold text-indigo-700 hover:underline" to="/register">Create an account</Link></>
              : <>Already have an account? <Link className="font-semibold text-indigo-700 hover:underline" to="/login">Sign in</Link></>}
          </p>
        </div>
      </main>

      {/* decorative photo collage (desktop only) */}
      <aside aria-hidden className="relative hidden overflow-hidden bg-slate-900 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#4f46e5_0,transparent_55%),radial-gradient(circle_at_80%_80%,#c026d3_0,transparent_50%)] opacity-70" />
        {HERO.map((h) => (
          <div key={h.src} className={`absolute overflow-hidden rounded-3xl shadow-2xl ring-4 ring-white/20 ${h.cls}`}>
            <img src={h.src} alt="" className="h-full w-full animate-kenburns object-cover" />
          </div>
        ))}
        <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-slate-950/90 to-transparent p-10 pt-20 text-white">
          <p className="max-w-sm text-2xl font-bold leading-snug">Your memories, beautifully organised.</p>
          <p className="mt-2 max-w-sm text-sm text-white/70">Albums, tags, and private links you control.</p>
        </div>
      </aside>
    </div>
  );
}
