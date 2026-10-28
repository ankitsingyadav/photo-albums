import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage, qs } from "../api";
import { useCountUp, useDebounced, useGlobalDrop, useLoad, useSelection, useStored } from "../hooks";
import type { Photo, Sort, Stats, TagCount } from "../types";
import { BarButton, Button, Empty, ErrorBanner, GridSkeleton, Icon, SelectionBar, SortSelect, TagFilter, formatBytes, useConfirm, useToast, type IconName } from "../ui";
import { PhotoGrid } from "../PhotoGrid";
import { Lightbox } from "../Lightbox";
import { DropOverlay, UploadPanel, UploadProgress, useUploader } from "../Upload";
import { AddToAlbumModal, BulkTagModal } from "../Dialogs";

const DENSITIES = [{ label: "S", px: 140 }, { label: "M", px: 200 }, { label: "L", px: 280 }];

export default function Library() {
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const [tags, setTags] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>("date_desc");
  const [q, setQ] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [density, setDensity] = useStored("photo-density", 200);
  const [group, setGroup] = useStored<"auto" | "month" | "year" | "none">("photo-group-v2", "auto");
  const [showUpload, setShowUpload] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const [albumPicker, setAlbumPicker] = useState(false);
  const [tagPicker, setTagPicker] = useState(false);
  const dq = useDebounced(q.trim(), 250);

  const photos = useLoad(
    () => api.get<{ photos: Photo[] }>(`/api/photos${qs({ tags: tags.join(","), sort, q: dq, favorites: favOnly ? "1" : undefined })}`),
    [tags.join(","), sort, dq, favOnly]
  );
  const allTags = useLoad(() => api.get<{ tags: TagCount[] }>("/api/tags"), []);
  const stats = useLoad(() => api.get<Stats>("/api/stats"), []);
  const list = photos.data?.photos ?? [];
  const ids = useMemo(() => list.map((p) => p.id), [list]);
  const sel = useSelection(ids);
  const chosen = list.filter((p) => sel.selected.has(p.id));
  // "Auto" groups only when the library is big enough for headings to help
  const groupBy = group === "auto" ? (list.length > 60 ? "month" : list.length > 24 ? "year" : "none") : group;
  const filtering = tags.length > 0 || dq !== "" || favOnly;

  const refresh = () => { void photos.reload(); void allTags.reload(); void stats.reload(); };
  const uploader = useUploader(refresh);
  const dragging = useGlobalDrop((files) => void uploader.upload(files));

  const setFavorite = async (targets: Photo[], favorite: boolean) => {
    const idSet = new Set(targets.map((p) => p.id));
    photos.setData((d) => d && { photos: d.photos.map((p) => (idSet.has(p.id) ? { ...p, favorite } : p)) }); // instant, undone below if the server says no
    try {
      if (targets.length === 1) await api.patch(`/api/photos/${targets[0].id}`, { favorite });
      else await api.post("/api/photos/bulk-favorite", { photoIds: [...idSet], favorite });
      void stats.reload();
      if (favOnly && !favorite) void photos.reload();
    } catch (e) {
      photos.setData((d) => d && { photos: d.photos.map((p) => (idSet.has(p.id) ? { ...p, favorite: !favorite } : p)) });
      toast(errorMessage(e), "error");
    }
  };
  const toggleFavorite = (p: Photo) => void setFavorite([p], !p.favorite);

  const remove = async () => {
    const n = sel.selected.size;
    if (!(await confirm({ title: `Delete ${n} photo${n > 1 ? "s" : ""}?`, message: "This permanently deletes the photos from your library and from every album. This can't be undone.", action: "Delete", danger: true }))) return;
    const results = await Promise.allSettled([...sel.selected].map((id) => api.del(`/api/photos/${id}`)));
    const failed = results.filter((r) => r.status === "rejected").length;
    toast(failed ? `${failed} could not be deleted` : `${n} photo${n > 1 ? "s" : ""} deleted`, failed ? "error" : "success");
    sel.clear(); refresh();
  };

  const changeTags = async (photoId: number, next: string[]) => {
    const r = await api.put<{ photo: Photo }>(`/api/photos/${photoId}/tags`, { tags: next });
    photos.setData((d) => d && { photos: d.photos.map((p) => (p.id === photoId ? r.photo : p)) });
    void allTags.reload();
  };

  const allFav = chosen.length > 0 && chosen.every((p) => p.favorite);

  return (
    <div className="space-y-5">
      <DropOverlay show={dragging} />
      <UploadProgress state={uploader.state} />
      {confirmDialog}

      <div className="flex flex-wrap items-end justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Your photos</h1>
          <p className="mt-1 text-slate-500">Everything you've uploaded, newest memories first.</p>
        </div>
        <Button variant="primary" onClick={() => setShowUpload((v) => !v)} className="min-h-11"><Icon name={showUpload ? "x" : "upload"} className="h-4 w-4" />{showUpload ? "Close" : "Upload photos"}</Button>
      </div>

      {stats.data && (
        <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
          <StatCard icon="image" label="Photos" value={stats.data.photos} tone="from-indigo-500 to-violet-500" />
          <StatCard icon="layers" label="Albums" value={stats.data.albums} hint={stats.data.sharedAlbums ? `${stats.data.sharedAlbums} shared` : undefined} tone="from-fuchsia-500 to-pink-500" />
          <StatCard icon="heart" label="Favorites" value={stats.data.favorites} tone="from-rose-500 to-orange-400" />
          <StatCard icon="download" label="Storage" text={formatBytes(stats.data.bytes)} tone="from-emerald-500 to-teal-500" />
        </div>
      )}

      {showUpload && <UploadPanel upload={uploader.upload} busy={!!uploader.state} onClose={() => setShowUpload(false)} />}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-sm">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by file name" aria-label="Search by file name" maxLength={100}
            className="min-h-10 w-full rounded-xl bg-white pl-9 pr-9 text-sm shadow-sm ring-1 ring-slate-200 transition focus:ring-2 focus:ring-indigo-500" />
          {q && <button onClick={() => setQ("")} aria-label="Clear search" className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-slate-100"><Icon name="x" className="h-3.5 w-3.5" /></button>}
        </div>
        <button onClick={() => setFavOnly((v) => !v)} aria-pressed={favOnly}
          className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-medium transition active:scale-95 ${favOnly ? "bg-rose-500 text-white shadow-md shadow-rose-500/30" : "bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 hover:ring-rose-300"}`}>
          <Icon name="heart" className="h-4 w-4" fill={favOnly} />Favorites
        </button>
        <SortSelect value={sort} onChange={setSort} />
        <select aria-label="Group photos" value={group} onChange={(e) => setGroup(e.target.value as "auto" | "month" | "year" | "none")}
          className="min-h-10 cursor-pointer rounded-xl bg-white px-3 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:ring-slate-300">
          <option value="auto">Group: auto</option>
          <option value="year">Group by year</option>
          <option value="month">Group by month</option>
          <option value="none">No grouping</option>
        </select>
        <div role="group" aria-label="Photo size" className="ml-auto flex max-sm:hidden rounded-xl bg-white p-0.5 shadow-sm ring-1 ring-slate-200">
          {DENSITIES.map((d) => (
            <button key={d.px} onClick={() => setDensity(d.px)} aria-pressed={density === d.px} aria-label={`Photo size ${d.label}`}
              className={`min-h-9 min-w-9 rounded-[10px] text-sm font-semibold transition ${density === d.px ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}>{d.label}</button>
          ))}
        </div>
      </div>

      <TagFilter tags={allTags.data?.tags ?? []} selected={tags} onChange={setTags} />

      {filtering && photos.data && (
        <p className="animate-fade-in text-sm text-slate-500">
          {list.length} photo{list.length === 1 ? "" : "s"} found
          {dq && <> for “{dq}”</>}{tags.length > 0 && <> with {tags.map((t) => `#${t}`).join(" + ")}</>}{favOnly && <> in favorites</>}.{" "}
          <button className="font-medium text-indigo-700 hover:underline" onClick={() => { setTags([]); setQ(""); setFavOnly(false); }}>Clear all filters</button>
        </p>
      )}

      {photos.error && <ErrorBanner message={photos.error} />}
      {!photos.data && photos.loading ? <GridSkeleton /> : photos.data && list.length === 0 ? (
        filtering ? <Empty icon="search" title="No photos match">Try removing a filter or searching for something else.</Empty>
          : <Empty icon="camera" title="No photos yet" action={<Button variant="primary" onClick={() => setShowUpload(true)}><Icon name="upload" className="h-4 w-4" />Upload your first photos</Button>}>
              Drop photos anywhere on this page, or use the upload button. Thumbnails are created for you.
            </Empty>
      ) : (
        <div className={`transition-opacity duration-300 ${photos.loading ? "opacity-60" : "opacity-100"}`}>
          <PhotoGrid photos={list} onOpen={setViewer} selected={sel.selected} onSelect={sel.toggle} onSelectMany={sel.setMany}
            onFavorite={toggleFavorite} groupBy={groupBy} rowHeight={density} />
        </div>
      )}

      {sel.selected.size > 0 && (
        <SelectionBar count={sel.selected.size}>
          <BarButton icon="check" label={sel.selected.size === list.length ? "All selected" : "Select all"} onClick={sel.selectAll} disabled={sel.selected.size === list.length} />
          <BarButton icon="heart" fill={allFav} label={allFav ? "Unfavorite" : "Favorite"} onClick={() => void setFavorite(chosen, !allFav)} />
          <BarButton icon="tag" label="Tag" onClick={() => setTagPicker(true)} />
          <BarButton icon="folder" label="Add to album" onClick={() => setAlbumPicker(true)} />
          <BarButton icon="trash" label="Delete" danger onClick={remove} />
          <BarButton icon="x" label="Clear" onClick={sel.clear} />
        </SelectionBar>
      )}

      {viewer !== null && <Lightbox photos={list} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} owner={{ onTagsChange: changeTags, onFavorite: toggleFavorite }} />}
      {albumPicker && <AddToAlbumModal photoIds={[...sel.selected]} onClose={() => setAlbumPicker(false)} onDone={() => { setAlbumPicker(false); sel.clear(); void stats.reload(); }} />}
      {tagPicker && <BulkTagModal photos={chosen} onClose={() => setTagPicker(false)} onDone={() => { setTagPicker(false); sel.clear(); refresh(); }} />}
      {stats.data && stats.data.albums === 0 && list.length > 0 && sel.selected.size === 0 && (
        <p className="text-center text-sm text-slate-400">Tip: select photos to add them to an album. <Link to="/albums" className="text-indigo-600 hover:underline">Open albums</Link></p>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, text, hint, tone }: { icon: IconName; label: string; value?: number; text?: string; hint?: string; tone: string }) {
  const n = useCountUp(value ?? 0);
  return (
    <div className="animate-fade-up rounded-2xl bg-white p-3 shadow-sm sm:p-4 ring-1 ring-slate-200/80 transition duration-300 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-md sm:h-10 sm:w-10 ${tone}`}><Icon name={icon} className="h-5 w-5" /></span>
        <div>
          <p className="whitespace-nowrap text-xl font-bold leading-none tabular-nums sm:text-2xl">{text ?? n}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">{label}{hint && <span className="text-slate-400 max-sm:hidden"> · {hint}</span>}</p>
        </div>
      </div>
    </div>
  );
}
