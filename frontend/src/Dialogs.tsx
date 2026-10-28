import { useMemo, useState, type FormEvent } from "react";
import { api, errorMessage } from "./api";
import { useLoad } from "./hooks";
import type { Album, Photo } from "./types";
import { Button, ErrorBanner, Icon, Modal, Spinner, useToast } from "./ui";

/** Add and remove tags on several photos at once. */
export function BulkTagModal({ photos, onClose, onDone }: { photos: Photo[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const [remove, setRemove] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const existing = useMemo(() => {
    const counts = new Map<string, number>();
    photos.forEach((p) => p.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [photos]);
  const add = draft.split(",").map((t) => t.trim()).filter(Boolean);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.post("/api/photos/bulk-tags", { photoIds: photos.map((p) => p.id), add, remove: [...remove] });
      toast(`Tags updated on ${photos.length} photo${photos.length > 1 ? "s" : ""}`);
      onDone();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Tag ${photos.length} photo${photos.length > 1 ? "s" : ""}`} onClose={onClose} wide={false}>
      <form onSubmit={submit} className="space-y-5">
        <ErrorBanner message={error} />
        <label className="block text-sm font-medium text-slate-700">Add tags
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="holiday, family, 2024" maxLength={200}
            className="mt-1.5 min-h-11 w-full rounded-xl px-3 ring-1 ring-slate-200 transition focus:ring-2 focus:ring-indigo-500" />
          <span className="mt-1 block text-xs font-normal text-slate-500">Separate tags with commas.</span>
        </label>
        {add.length > 0 && <div className="flex flex-wrap gap-2">{add.map((t) => <span key={t} className="animate-pop rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-800">+ {t}</span>)}</div>}
        {existing.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Remove tags <span className="font-normal text-slate-400">(tap to mark)</span></p>
            <div className="flex flex-wrap gap-2">
              {existing.map(([t, n]) => {
                const on = remove.has(t);
                return (
                  <button type="button" key={t} aria-pressed={on} onClick={() => setRemove((s) => { const x = new Set(s); on ? x.delete(t) : x.add(t); return x; })}
                    className={`rounded-full px-3 py-1 text-sm font-medium transition active:scale-95 ${on ? "bg-red-100 text-red-700 line-through" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                    {t} <span className="text-xs opacity-60">{n}/{photos.length}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy || (add.length === 0 && remove.size === 0)}>{busy ? "Saving…" : "Apply"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Pick an album (or create one) to put the selected photos in. */
export function AddToAlbumModal({ photoIds, onClose, onDone }: { photoIds: number[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const albums = useLoad(() => api.get<{ albums: Album[] }>("/api/albums"), []);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = async (albumId: number, name: string) => {
    try {
      await api.post(`/api/albums/${albumId}/photos`, { photoIds });
      toast(`Added to “${name}”`);
      onDone();
    } catch (e) { setError(errorMessage(e)); }
  };
  const create = async (e: FormEvent) => {
    e.preventDefault();
    try { const r = await api.post<{ album: Album }>("/api/albums", { title }); await add(r.album.id, r.album.title); }
    catch (err) { setError(errorMessage(err)); }
  };

  return (
    <Modal title={`Add ${photoIds.length} photo${photoIds.length > 1 ? "s" : ""} to an album`} onClose={onClose} wide={false}>
      <div className="space-y-4">
        <ErrorBanner message={error} />
        <form onSubmit={create} className="flex gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New album title" aria-label="New album title" maxLength={100}
            className="min-h-11 flex-1 rounded-xl px-3 ring-1 ring-slate-200 transition focus:ring-2 focus:ring-indigo-500" />
          <Button type="submit" variant="primary"><Icon name="plus" className="h-4 w-4" />Create</Button>
        </form>
        {albums.loading && !albums.data ? <Spinner /> : (
          <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-2xl ring-1 ring-slate-200">
            {(albums.data?.albums ?? []).map((a) => (
              <li key={a.id}>
                <button onClick={() => add(a.id, a.title)} className="flex min-h-14 w-full items-center gap-3 px-3 text-left transition hover:bg-indigo-50 active:bg-indigo-100">
                  {a.coverUrl ? <img src={a.coverUrl} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-400"><Icon name="image" className="h-5 w-5" /></span>}
                  <span className="flex-1 truncate font-medium">{a.title}</span>
                  <span className="text-sm text-slate-400">{a.photoCount}</span>
                </button>
              </li>
            ))}
            {albums.data?.albums.length === 0 && <li className="px-3 py-5 text-center text-sm text-slate-500">No albums yet. Create your first one above.</li>}
          </ul>
        )}
      </div>
    </Modal>
  );
}
