import { createPortal } from "react-dom";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Sort, TagCount } from "./types";

/** Renders children directly in <body>, so overlays always sit above the page (no stacking-context surprises). */
export const Portal = ({ children }: { children: ReactNode }) => createPortal(children, document.body);

/* ---------- Icons (stroke icons, 24x24) ---------- */
const ICONS = {
  heart: <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  check: <path d="M20 6 9 17l-5-5" />,
  search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
  upload: <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />,
  download: <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />,
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
  play: <path d="m6 3 14 9-14 9V3Z" />,
  pause: <path d="M6 4h4v16H6zM14 4h4v16h-4z" />,
  zoom: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3M11 8v6M8 11h6" /></>,
  link: <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />,
  tag: <><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" /><circle cx="7.5" cy="7.5" r=".5" /></>,
  folder: <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />,
  trash: <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />,
  plus: <path d="M5 12h14M12 5v14" />,
  left: <path d="m15 18-6-6 6-6" />,
  right: <path d="m9 18 6-6-6-6" />,
  back: <path d="m12 19-7-7 7-7M19 12H5" />,
  camera: <><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></>,
  image: <><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></>,
  logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  edit: <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />,
  star: <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />,
  layers: <><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" /><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" /><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" /></>,
  globe: <><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20" /></>,
  lock: <><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  eye: <><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></>,
  sparkles: <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />,
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "h-5 w-5", fill = false }: { name: IconName; className?: string; fill?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={fill ? "currentColor" : "none"} stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

export function Logo({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold tracking-tight ${className}`}>
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-md shadow-indigo-500/30">
        <Icon name="camera" className="h-4.5 w-4.5" />
      </span>
      <span className={compact ? "max-sm:hidden" : ""}>Photo Albums</span>
    </span>
  );
}

/* ---------- Buttons ---------- */
type Variant = "primary" | "secondary" | "danger" | "ghost" | "glass";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-500/30 hover:shadow-md hover:shadow-indigo-500/40 hover:brightness-110 disabled:opacity-50 disabled:shadow-none",
  secondary: "bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50 hover:ring-slate-300 shadow-sm disabled:text-slate-400",
  danger: "bg-white text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:text-red-300",
  ghost: "text-slate-700 hover:bg-slate-900/5 disabled:text-slate-400",
  glass: "bg-white/15 text-white hover:bg-white/25 backdrop-blur disabled:opacity-40",
};
export function Button({ variant = "secondary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button {...props}
      className={`inline-flex min-h-10 select-none items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition duration-200 active:scale-[.97] disabled:cursor-not-allowed disabled:active:scale-100 ${VARIANTS[variant]} ${className}`} />
  );
}

export function IconButton({ icon, label, variant = "ghost", className = "", fill, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; variant?: Variant; fill?: boolean }) {
  return (
    <button {...props} aria-label={label} title={label}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition duration-200 active:scale-90 disabled:opacity-40 ${VARIANTS[variant]} ${className}`}>
      <Icon name={icon} fill={fill} />
    </button>
  );
}

/* ---------- Toasts ---------- */
type ToastKind = "success" | "error" | "info";
const ToastCtx = createContext<(message: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; message: string; kind: ToastKind }[]>([]);
  const next = useRef(1);
  const push = useCallback((message: string, kind: ToastKind = "success") => {
    const id = next.current++;
    setItems((l) => [...l.slice(-3), { id, message, kind }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), kind === "error" ? 6000 : 3200);
  }, []);
  const tone = { success: "bg-slate-900 text-white", error: "bg-red-600 text-white", info: "bg-indigo-600 text-white" };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} role={t.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex max-w-md animate-toast items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium shadow-xl ${tone[t.kind]}`}>
            <Icon name={t.kind === "error" ? "x" : "check"} className="h-4 w-4 shrink-0" />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Dialogs ---------- */
export function Modal({ title, onClose, children, wide = true }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <Portal><div className="fixed inset-0 z-[60] flex animate-fade-in items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[90vh] w-full animate-sheet flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}>
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>
        <div className="overflow-y-auto px-5 pb-5">{children}</div>
      </div>
    </div></Portal>
  );
}

/** A nicer replacement for window.confirm. Usage: const [confirm, dialog] = useConfirm(); if (await confirm({...})) ... */
export function useConfirm() {
  const [state, setState] = useState<{ title: string; message: string; action: string; danger: boolean; resolve: (v: boolean) => void } | null>(null);
  const confirm = useCallback((o: { title: string; message: string; action: string; danger?: boolean }) =>
    new Promise<boolean>((resolve) => setState({ ...o, danger: o.danger ?? false, resolve })), []);
  const close = (v: boolean) => { state?.resolve(v); setState(null); };
  const dialog = state && (
    <Modal title={state.title} onClose={() => close(false)} wide={false}>
      <p className="mb-5 text-sm text-slate-600">{state.message}</p>
      <div className="flex justify-end gap-2">
        <Button onClick={() => close(false)}>Cancel</Button>
        <Button variant="primary" className={state.danger ? "!from-red-600 !to-rose-600" : ""} onClick={() => close(true)}>{state.action}</Button>
      </div>
    </Modal>
  );
  return [confirm, dialog] as const;
}

/* ---------- Feedback ---------- */
export function ErrorBanner({ message, onClose }: { message: string | null; onClose?: () => void }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex animate-fade-up items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <span>{message}</span>
      {onClose && <button onClick={onClose} aria-label="Dismiss" className="font-bold">×</button>}
    </div>
  );
}

export function Empty({ icon = "image", title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="animate-fade-up rounded-3xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center backdrop-blur">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-100 to-fuchsia-100 text-indigo-600"><Icon name={icon} className="h-7 w-7" /></div>
      <p className="text-base font-semibold text-slate-800">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

const SKELETON_RATIOS = [1.5, 0.75, 1.33, 1.78, 1, 1.5, 0.67, 1.5, 1.33, 1.78, 1, 0.75];
export function GridSkeleton() {
  return (
    <div className="flex flex-wrap gap-2 [--row-h:130px] sm:[--row-h:190px]" aria-label="Loading photos" role="status">
      {SKELETON_RATIOS.map((r, i) => (
        <div key={i} className="shimmer rounded-xl" style={{ flexGrow: r, flexBasis: `calc(var(--row-h) * ${r})`, height: "var(--row-h)", animationDelay: `${i * 80}ms` }} />
      ))}
    </div>
  );
}

export const Spinner = ({ label = "Loading…" }: { label?: string }) => <p className="py-10 text-center text-sm text-slate-500" role="status">{label}</p>;

/* ---------- Controls ---------- */
export function SortSelect({ value, onChange }: { value: Sort; onChange: (s: Sort) => void }) {
  return (
    <select aria-label="Sort photos" value={value} onChange={(e) => onChange(e.target.value as Sort)}
      className="min-h-10 cursor-pointer rounded-xl bg-white px-3 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:ring-slate-300">
      <option value="date_desc">Newest first</option>
      <option value="date_asc">Oldest first</option>
    </select>
  );
}

/** Click tags to filter. Photos must have ALL selected tags. */
export function TagFilter({ tags, selected, onChange }: { tags: TagCount[]; selected: string[]; onChange: (t: string[]) => void }) {
  if (tags.length === 0) return null;
  const toggle = (name: string) => onChange(selected.includes(name) ? selected.filter((t) => t !== name) : [...selected, name]);
  return (
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap" aria-label="Filter by tags">
      {tags.map((t) => {
        const on = selected.includes(t.name);
        return (
          <button key={t.name} onClick={() => toggle(t.name)} aria-pressed={on}
            className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition duration-200 active:scale-95 ${on
              ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/25"
              : "bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-indigo-300"}`}>
            <Icon name="tag" className="h-3.5 w-3.5 opacity-70" />{t.name}
            <span className={`text-xs ${on ? "text-indigo-200" : "text-slate-400"}`}>{t.count}</span>
          </button>
        );
      })}
      {selected.length > 0 && <button onClick={() => onChange([])} className="min-h-9 shrink-0 px-2 text-sm font-medium text-indigo-700 hover:underline">Clear</button>}
    </div>
  );
}

/* ---------- Floating bar shown while photos are selected ---------- */
export function SelectionBar({ count, children }: { count: number; children: ReactNode }) {
  return (
    <Portal><div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-3">
      <div className="no-scrollbar pointer-events-auto flex max-w-full animate-slide-up items-center gap-1 overflow-x-auto rounded-2xl bg-slate-900/95 p-1.5 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
        <span className="shrink-0 whitespace-nowrap px-3 text-sm font-semibold tabular-nums">{count} selected</span>
        <span className="h-6 w-px shrink-0 bg-white/15" />
        {children}
      </div>
    </div></Portal>
  );
}
export function BarButton({ icon, label, onClick, danger, disabled, fill }: { icon: IconName; label: string; onClick: () => void; danger?: boolean; disabled?: boolean; fill?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} title={label}
      className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium transition active:scale-95 disabled:opacity-40 ${danger ? "text-red-300 hover:bg-red-500/20" : "hover:bg-white/10"}`}>
      <Icon name={icon} className="h-4.5 w-4.5" fill={fill} /><span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/* ---------- Formatting ---------- */
export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
export const monthLabel = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", timeZone: "UTC" });
export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
