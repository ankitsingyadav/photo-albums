import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, errorMessage, qs } from "../api";
import { useDebounced, useGlobalDrop, useLoad, useSelection, useStored } from "../hooks";
import type { Album, Photo, Sort, TagCount } from "../types";
import { BarButton, Button, Empty, ErrorBanner, GridSkeleton, Icon, Modal, SelectionBar, SortSelect, TagFilter, useConfirm, useToast } from "../ui";
import { PhotoGrid } from "../PhotoGrid";
import { Lightbox } from "../Lightbox";
import { DropOverlay, UploadPanel, UploadProgress, useUploader } from "../Upload";
import { BulkTagModal } from "../Dialogs";

export default function AlbumDetail() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const [tags, setTags] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>("date_desc");
  const [density] = useStored("photo-density", 200);
  const [viewer, setViewer] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [tagPicker, setTagPicker] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const view = useLoad(() => api.get<{ album: Album; photos: Photo[] }>(`/api/albums/${id}${qs({ tags: tags.join(","), sort })}`), [id, tags.join(","), sort]);
  const allTags = useLoad(() => api.get<{ tags: TagCount[] }>("/api/tags"), []);
  const album = view.data?.album;
  const photos = view.data?.photos ?? [];
  const ids = useMemo(() => photos.map((p) => p.id), [photos]);
  const sel = useSelection(ids);
  const chosen = photos.filter((p) => sel.selected.has(p.id));

  const refresh = () => { void view.reload(); void allTags.reload(); };
  const uploader = useUploader(refresh, id);
  const dragging = useGlobalDrop((files) => void uploader.upload(files));

  const act = async (fn: () => Promise<unknown>, success?: string) => {
    try { await fn(); await view.reload(); if (success) toast(success); } catch (e) { toast(errorMessage(e), "error"); }
  };

  const setCover = () => act(async () => { await api.patch(`/api/albums/${id}`, { coverPhotoId: [...sel.selected][0] }); sel.clear(); }, "Cover updated");
  const removeSelected = () => act(async () => {
    for (const pid of sel.selected) await api.del(`/api/albums/${id}/photos/${pid}`);
    toast(`Removed ${sel.selected.size} from album`);
    sel.clear();
  });
  const deleteAlbum = async () => {
    if (!(await confirm({ title: "Delete this album?", message: "The album and its share link are deleted. The photos stay in your library.", action: "Delete album", danger: true }))) return;
    try { await api.del(`/api/albums/${id}`); toast("Album deleted"); navigate("/albums"); } catch (e) { toast(errorMessage(e), "error"); }
  };
  const toggleFavorite = async (p: Photo) => {
    const next = !p.favorite;
    view.setData((d) => d && { ...d, photos: d.photos.map((x) => (x.id === p.id ? { ...x, favorite: next } : x)) });
    try { await api.patch(`/api/photos/${p.id}`, { favorite: next }); }
    catch (e) { view.setData((d) => d && { ...d, photos: d.photos.map((x) => (x.id === p.id ? { ...x, favorite: !next } : x)) }); toast(errorMessage(e), "error"); }
  };
  const changeTags = async (photoId: number, next: string[]) => {
    const r = await api.put<{ photo: Photo }>(`/api/photos/${photoId}/tags`, { tags: next });
    view.setData((d) => d && { ...d, photos: d.photos.map((p) => (p.id === photoId ? r.photo : p)) });
    void allTags.reload();
  };

  if (!view.data && view.loading) return <GridSkeleton />;
  if (view.error || !album) return <div className="space-y-3"><ErrorBanner message={view.error ?? "Album not found"} /><Link to="/albums" className="text-indigo-700 underline">← Back to albums</Link></div>;

  return (
    <div className="space-y-5">
      <DropOverlay show={dragging} text="Drop photos to add to this album" />
      <UploadProgress state={uploader.state} />
      {confirmDialog}

      {/* hero */}
      <section className="relative animate-fade-up overflow-hidden rounded-3xl bg-slate-900 text-white shadow-lg">
        {album.coverUrl && <img src={album.coverUrl} alt="" className="absolute inset-0 h-full w-full scale-125 object-cover opacity-90 blur-xl saturate-150" />}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/20 to-transparent" />
        <div className="relative flex items-end justify-between gap-6 p-5 sm:p-8">
          <div className="min-w-0 flex-1">
            <Link to="/albums" className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm backdrop-blur transition hover:bg-white/25"><Icon name="back" className="h-3.5 w-3.5" />Albums</Link>
            <h1 className="break-words text-3xl font-bold tracking-tight sm:text-4xl">{album.title}</h1>
            <p className="mt-1 text-white/70">{album.photoCount} photo{album.photoCount === 1 ? "" : "s"}{album.shareEnabled && " · shared with a public link"}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="glass" onClick={() => setAdding(true)}><Icon name="plus" className="h-4 w-4" />Add from library</Button>
              <Button variant="glass" onClick={() => setShowUpload((v) => !v)}><Icon name="upload" className="h-4 w-4" />Upload here</Button>
              <Button variant="glass" onClick={() => setRenaming(true)}><Icon name="edit" className="h-4 w-4" />Rename</Button>
              {album.photoCount > 0 && <a href={`/api/albums/${id}/zip`} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/15 px-4 text-sm font-medium backdrop-blur transition hover:bg-white/25 active:scale-[.97]"><Icon name="download" className="h-4 w-4" />ZIP</a>}
              <Button variant="glass" className="hover:!bg-red-500/60" onClick={deleteAlbum}><Icon name="trash" className="h-4 w-4" />Delete</Button>
            </div>
          </div>
          {album.coverUrl && <img src={album.coverUrl} alt="Album cover" className="hidden h-40 w-56 shrink-0 rotate-3 rounded-2xl object-cover shadow-2xl ring-4 ring-white/30 transition duration-500 hover:rotate-0 hover:scale-105 md:block" />}
        </div>
      </section>

      <SharePanel album={album} onChanged={() => void view.reload()} />
      {showUpload && <UploadPanel upload={uploader.upload} busy={!!uploader.state} onClose={() => setShowUpload(false)} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1"><TagFilter tags={allTags.data?.tags ?? []} selected={tags} onChange={setTags} /></div>
        <SortSelect value={sort} onChange={setSort} />
      </div>

      {photos.length === 0 ? (
        <Empty icon="image" title={tags.length ? "No photos match those tags" : "This album is empty"}
          action={!tags.length && <Button variant="primary" onClick={() => setAdding(true)}><Icon name="plus" className="h-4 w-4" />Add photos</Button>}>
          {tags.length ? "Clear a tag to see more." : "Add photos from your library, or drop files here to upload them straight into this album."}
        </Empty>
      ) : (
        <div className={`transition-opacity duration-300 ${view.loading ? "opacity-60" : ""}`}>
          <PhotoGrid photos={photos} onOpen={setViewer} selected={sel.selected} onSelect={sel.toggle} onSelectMany={sel.setMany}
            onFavorite={toggleFavorite} coverId={album.hasCustomCover ? album.coverPhotoId : null} groupBy={photos.length > 24 ? "month" : "none"} rowHeight={density} />
        </div>
      )}

      {sel.selected.size > 0 && (
        <SelectionBar count={sel.selected.size}>
          <BarButton icon="check" label="Select all" onClick={sel.selectAll} disabled={sel.selected.size === photos.length} />
          <BarButton icon="star" label="Use as cover" onClick={setCover} disabled={sel.selected.size !== 1} />
          <BarButton icon="tag" label="Tag" onClick={() => setTagPicker(true)} />
          <BarButton icon="folder" label="Remove from album" onClick={removeSelected} />
          <BarButton icon="x" label="Clear" onClick={sel.clear} />
        </SelectionBar>
      )}

      {viewer !== null && <Lightbox photos={photos} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} owner={{ onTagsChange: changeTags, onFavorite: toggleFavorite }} />}
      {adding && <AddFromLibrary albumId={id} onClose={() => setAdding(false)} onDone={() => { setAdding(false); refresh(); }} />}
      {renaming && <RenameModal album={album} onClose={() => setRenaming(false)} onDone={() => { setRenaming(false); void view.reload(); }} />}
      {tagPicker && <BulkTagModal photos={chosen} onClose={() => setTagPicker(false)} onDone={() => { setTagPicker(false); sel.clear(); refresh(); }} />}
    </div>
  );
}

function SharePanel({ album, onChanged }: { album: Album; onChanged: () => void }) {
  const toast = useToast();
  const [confirm, dialog] = useConfirm();
  const [busy, setBusy] = useState(false);
  const url = album.shareToken ? `${window.location.origin}/s/${album.shareToken}` : "";

  const toggle = async () => {
    if (album.shareEnabled && !(await confirm({ title: "Turn off the public link?", message: "Anyone using the link loses access immediately. If you turn sharing on again later, you'll get a brand-new link.", action: "Turn off", danger: true }))) return;
    setBusy(true);
    try {
      if (album.shareEnabled) await api.del(`/api/albums/${album.id}/share`);
      else await api.post(`/api/albums/${album.id}/share`);
      toast(album.shareEnabled ? "Public link turned off" : "Public link created");
      onChanged();
    } catch (e) { toast(errorMessage(e), "error"); } finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast("Link copied"); }
    catch { toast("Couldn't copy automatically. Select the link and copy it.", "error"); }
  };

  return (
    <section aria-label="Sharing" className="animate-fade-up rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`grid h-11 w-11 place-items-center rounded-2xl transition-colors duration-300 ${album.shareEnabled ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
            <Icon name={album.shareEnabled ? "globe" : "lock"} className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold">{album.shareEnabled ? "Public link is on" : "Private album"}</p>
            <p className="text-sm text-slate-500">{album.shareEnabled ? "Anyone with the link can view this album (read-only)." : "Only you can see this album."}</p>
          </div>
        </div>
        <Button variant={album.shareEnabled ? "danger" : "primary"} onClick={toggle} disabled={busy}>
          <Icon name="link" className="h-4 w-4" />{album.shareEnabled ? "Turn off link" : "Create public link"}
        </Button>
      </div>
      {album.shareEnabled && (
        <div className="mt-3 flex animate-fade-up gap-2">
          <input readOnly value={url} aria-label="Public link" onFocus={(e) => e.currentTarget.select()} className="min-h-11 min-w-0 flex-1 rounded-xl bg-slate-50 px-3 text-sm text-slate-600 ring-1 ring-slate-200" />
          <Button onClick={copy}>Copy</Button>
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-medium text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 max-sm:hidden"><Icon name="eye" className="h-4 w-4" />Preview</a>
        </div>
      )}
    </section>
  );
}

function RenameModal({ album, onClose, onDone }: { album: Album; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(album.title);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try { await api.patch(`/api/albums/${album.id}`, { title }); toast("Album renamed"); onDone(); }
    catch (err) { setError(errorMessage(err)); }
  };
  return (
    <Modal title="Rename album" onClose={onClose} wide={false}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBanner message={error} />
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Album title" maxLength={100}
          className="min-h-11 w-full rounded-xl px-3 ring-1 ring-slate-200 transition focus:ring-2 focus:ring-indigo-500" />
        <div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary">Save</Button></div>
      </form>
    </Modal>
  );
}

function AddFromLibrary({ albumId, onClose, onDone }: { albumId: number; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 250);
  const lib = useLoad(() => api.get<{ photos: Photo[] }>(`/api/photos${qs({ q: dq })}`), [dq]);
  const inAlbum = useLoad(() => api.get<{ photos: Photo[] }>(`/api/albums/${albumId}`).then((r) => new Set(r.photos.map((p) => p.id))), [albumId]);
  const available = useMemo(() => (lib.data?.photos ?? []).filter((p) => !inAlbum.data?.has(p.id)), [lib.data, inAlbum.data]);
  const sel = useSelection(useMemo(() => available.map((p) => p.id), [available]));
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    try { await api.post(`/api/albums/${albumId}/photos`, { photoIds: [...sel.selected] }); toast(`Added ${sel.selected.size} photo${sel.selected.size > 1 ? "s" : ""}`); onDone(); }
    catch (e) { setError(errorMessage(e)); }
  };
  return (
    <Modal title="Add photos from your library" onClose={onClose}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by file name" aria-label="Search library"
            className="min-h-10 w-full rounded-xl pl-9 pr-3 text-sm ring-1 ring-slate-200 transition focus:ring-2 focus:ring-indigo-500" />
        </div>
        {lib.loading && !lib.data ? <GridSkeleton /> : available.length === 0 ? <Empty icon="check" title="Nothing to add">Every matching photo is already in this album.</Empty> : (
          <div className="max-h-[50vh] overflow-y-auto"><PhotoGrid photos={available} rowHeight={120} selected={sel.selected} onSelect={sel.toggle} onOpen={(i) => sel.toggle(available[i].id, false)} /></div>
        )}
        <div className="flex items-center justify-between gap-2 pt-1">
          <button onClick={sel.selectAll} className="text-sm font-medium text-indigo-700 hover:underline" disabled={available.length === 0}>Select all {available.length}</button>
          <div className="flex gap-2"><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={add} disabled={sel.selected.size === 0}>Add {sel.selected.size || ""}</Button></div>
        </div>
      </div>
    </Modal>
  );
}
