import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "./api";

/** Loads data when the page opens (and when `deps` change). Call reload() to refresh. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);

  const run = useCallback(async () => {
    const mine = ++latest.current; // ignore answers from older requests (fast typing, quick filter changes)
    setLoading(true);
    try {
      const result = await fn();
      if (mine !== latest.current) return;
      setData(result);
      setError(null);
    } catch (e) {
      if (mine !== latest.current) return;
      setError(errorMessage(e));
    } finally {
      if (mine === latest.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { void run(); }, [run]);
  return { data, error, loading, reload: run, setData };
}

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** useState that remembers its value in localStorage (safely: storage can be blocked). */
export function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } }, [key, value]);
  return [value, setValue] as const;
}

/** Multi-select with shift-click ranges, like a file manager. */
export function useSelection(ids: number[]) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const last = useRef<number | null>(null);

  const toggle = useCallback((id: number, shift = false) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && last.current !== null) {
        const a = ids.indexOf(last.current), b = ids.indexOf(id);
        if (a !== -1 && b !== -1) {
          const [from, to] = a < b ? [a, b] : [b, a];
          const turnOn = !prev.has(id);
          for (const x of ids.slice(from, to + 1)) turnOn ? next.add(x) : next.delete(x);
          return next;
        }
      }
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    last.current = id;
  }, [ids]);

  const setMany = useCallback((list: number[], on: boolean) =>
    setSelected((prev) => { const n = new Set(prev); list.forEach((x) => (on ? n.add(x) : n.delete(x))); return n; }), []);
  const clear = useCallback(() => { setSelected(new Set()); last.current = null; }, []);
  const selectAll = useCallback(() => setSelected(new Set(ids)), [ids]);
  return { selected, toggle, setMany, clear, selectAll };
}

/** Detects files being dragged anywhere over the window, and calls onFiles when they're dropped. */
export function useGlobalDrop(onFiles: (files: File[]) => void, enabled = true) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const cb = useRef(onFiles);
  cb.current = onFiles;

  useEffect(() => {
    if (!enabled) return;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => { if (!hasFiles(e)) return; depth.current++; setDragging(true); };
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const leave = (e: DragEvent) => { if (!hasFiles(e)) return; depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) setDragging(false); };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      cb.current(Array.from(e.dataTransfer?.files ?? []));
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [enabled]);
  return dragging;
}

/** Animates a number counting up (used for the stats). */
export function useCountUp(target: number, ms = 700) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      setN(Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}
