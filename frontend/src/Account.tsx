import { useState, type FormEvent } from "react";
import { api, errorMessage } from "./api";
import { useAuth } from "./auth";
import { Button, ErrorBanner, Icon, Modal, useConfirm, useToast } from "./ui";

export const MIN_PASSWORD = 10;

/** Live checklist shown under a "new password" box. (The server also checks against common passwords.) */
export function PasswordHint({ password, email }: { password: string; email?: string }) {
  const long = password.length >= MIN_PASSWORD;
  const local = email?.split("@")[0]?.toLowerCase() ?? "";
  const hasEmail = local.length >= 4 && password.toLowerCase().includes(local);
  const row = (ok: boolean, text: string) => (
    <li className={`flex items-center gap-1.5 transition-colors ${ok ? "text-emerald-600" : "text-slate-500"}`}>
      <Icon name={ok ? "check" : "x"} className="h-3.5 w-3.5" />{text}
    </li>
  );
  return (
    <ul className="mt-2 space-y-1 text-xs" aria-live="polite">
      {row(long, `At least ${MIN_PASSWORD} characters`)}
      {row(password.length > 0 && !hasEmail, "Doesn't contain your email name")}
      <li className="pl-5 text-slate-400">Avoid common passwords. A few random words works well.</li>
    </ul>
  );
}

/** Change password and sign out of every device. */
export function AccountModal({ onClose }: { onClose: () => void }) {
  const { user, signOutAll } = useAuth();
  const toast = useToast();
  const [confirm, dialog] = useConfirm();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = again.length > 0 && again !== next;
  const input = "mt-1.5 min-h-11 w-full rounded-xl px-3 ring-1 ring-slate-200 transition focus:ring-2 focus:ring-indigo-500";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== again) { setError("The new passwords don't match"); return; }
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ signedOutOtherDevices: number }>("/api/auth/change-password", { currentPassword: current, newPassword: next });
      toast(r.signedOutOtherDevices ? `Password changed. ${r.signedOutOtherDevices} other device${r.signedOutOtherDevices > 1 ? "s were" : " was"} signed out.` : "Password changed");
      onClose();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  const everywhere = async () => {
    if (!(await confirm({ title: "Sign out everywhere?", message: "You'll be signed out on every device, including this one, and will need to sign in again.", action: "Sign out everywhere", danger: true }))) return;
    try { await signOutAll(); } catch (err) { setError(errorMessage(err)); }
  };

  return (
    <Modal title="Account & security" onClose={onClose} wide={false}>
      {dialog}
      <div className="space-y-6">
        <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
          <span aria-hidden className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-lg font-bold uppercase text-white">{user?.email[0]}</span>
          <div className="min-w-0"><p className="truncate font-semibold">{user?.email}</p><p className="text-xs text-slate-500">Signed in on this device</p></div>
        </div>

        <form onSubmit={submit} className="space-y-3" noValidate>
          <h3 className="flex items-center gap-2 font-semibold"><Icon name="lock" className="h-4 w-4 text-indigo-600" />Change password</h3>
          <ErrorBanner message={error} />
          <label className="block text-sm font-medium text-slate-700">Current password
            <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={input} />
          </label>
          <label className="block text-sm font-medium text-slate-700">New password
            <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={input} />
            <PasswordHint password={next} email={user?.email} />
          </label>
          <label className="block text-sm font-medium text-slate-700">Repeat new password
            <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} className={`${input} ${mismatch ? "!ring-red-400" : ""}`} />
            {mismatch && <span className="mt-1 block text-xs font-normal text-red-600">Passwords don't match</span>}
          </label>
          <Button type="submit" variant="primary" className="w-full" disabled={busy || !current || next.length < MIN_PASSWORD || next !== again}>{busy ? "Saving…" : "Change password"}</Button>
          <p className="text-xs text-slate-500">Changing your password signs you out on all your other devices.</p>
        </form>

        <div className="border-t border-slate-100 pt-5">
          <h3 className="mb-1 font-semibold">Sessions</h3>
          <p className="mb-3 text-sm text-slate-500">Lost a device, or used a shared computer? Sign out everywhere to end all logins at once.</p>
          <Button variant="danger" onClick={everywhere}><Icon name="logout" className="h-4 w-4" />Sign out everywhere</Button>
        </div>
      </div>
    </Modal>
  );
}
