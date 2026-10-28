import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { Photo } from "./types";
import { Icon, IconButton, Portal, formatBytes, formatDate } from "./ui";

const SLIDE_MS = 3800;

interface Props {
  photos: Photo[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  /** Owner-only actions. Leave out for the public page (read-only). */
  owner?: {
    onTagsChange: (photoId: number, tags: string[]) => Promise<void>;
    onFavorite: (photo: Photo) => void;
  };
}

/**
 * Full-screen viewer.
 * Keys: ← → move · Space slideshow · I info · Z zoom · F favourite · Esc close.
 * Touch: swipe left/right.
 */
export function Lightbox({ photos, index, onIndex, onClose, owner }: Props) {
  const photo = photos[index];
  const [loaded, setLoaded] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");
  const [playing, setPlaying] = useState(false);
  const [info, setInfo] = useState(false);
  const [draft, setDraft] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);
  const touchX = useRef<number | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const count = photos.length;

  const go = (delta: number, wrap = false) => {
    const next = index + delta;
    if (wrap) onIndex((next + count) % count);
    else if (next >= 0 && next < count) onIndex(next);
  };

  // Keyboard shortcuts (ignored while typing in the tag box)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === " ") { e.preventDefault(); if (count > 1) setPlaying((p) => !p); }
      else if (e.key.toLowerCase() === "i") setInfo((v) => !v);
      else if (e.key.toLowerCase() === "z") setZoomed((v) => !v);
      else if (e.key.toLowerCase() === "f" && owner && photo) owner.onFavorite(photo);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // New photo: reset zoom, show the (already cached) thumbnail while the full image loads
  useEffect(() => { setLoaded(false); setZoomed(false); setDraft(""); setTagError(null); }, [photo?.id]);

  // Preload the neighbours so next/previous feels instant
  useEffect(() => {
    for (const p of [photos[index - 1], photos[index + 1]]) if (p) new Image().src = p.fileUrl;
  }, [index, photos]);

  // Slideshow
  useEffect(() => {
    if (!playing || count < 2) return;
    const t = setTimeout(() => go(1, true), SLIDE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, index, count]);

  // Keep the current thumbnail visible in the filmstrip
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>("[aria-current='true']")?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [index]);

  if (!photo) return null;

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!zoomed) return;
    const r = e.currentTarget.getBoundingClientRect();
    setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
  };
  const toggleZoom = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
    setZoomed((v) => !v);
  };

  const saveTags = async (tags: string[]) => {
    try { setTagError(null); await owner?.onTagsChange(photo.id, tags); }
    catch (e) { setTagError(e instanceof Error ? e.message : "Could not save tags"); }
  };
  const addTag = () => {
    const parts = draft.split(",").map((t) => t.trim()).filter(Boolean);
    if (parts.length) void saveTags([...photo.tags, ...parts]);
    setDraft("");
  };

  return (
    <Portal><div className="fixed inset-0 z-50 flex animate-fade-in flex-col bg-neutral-950 text-white" role="dialog" aria-modal="true" aria-label="Photo viewer"
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current === null || zoomed) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
        touchX.current = null;
      }}>
      {playing && <div key={photo.id} className="absolute inset-x-0 top-0 z-20 h-0.5 origin-left animate-progress bg-gradient-to-r from-indigo-400 to-fuchsia-400" style={{ animationDuration: `${SLIDE_MS}ms` }} />}

      {/* top bar */}
      <div className={`z-10 flex items-center justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent px-3 py-2 transition-[padding] duration-300 ${info ? "sm:pr-[23rem]" : ""}`}>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{photo.filename}</p>
          <p className="truncate text-xs text-white/60">{index + 1} of {count} · {formatDate(photo.sortDate)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {owner && <IconButton icon="heart" label={photo.favorite ? "Remove from favorites (F)" : "Add to favorites (F)"} fill={!!photo.favorite}
            variant="glass" className={`bg-transparent ${photo.favorite ? "text-rose-400" : ""}`} onClick={() => owner.onFavorite(photo)} />}
          <IconButton icon="zoom" label="Zoom (Z)" variant="glass" className={`bg-transparent max-sm:hidden ${zoomed ? "!bg-white/25" : ""}`} onClick={() => setZoomed((v) => !v)} />
          {count > 1 && <IconButton icon={playing ? "pause" : "play"} label={playing ? "Pause slideshow (Space)" : "Play slideshow (Space)"} variant="glass" className={`bg-transparent ${playing ? "!bg-white/25" : ""}`} onClick={() => setPlaying((p) => !p)} />}
          <IconButton icon="info" label="Details (I)" variant="glass" className={`bg-transparent ${info ? "!bg-white/25" : ""}`} onClick={() => setInfo((v) => !v)} />
          <a href={photo.fileUrl} download={photo.filename} aria-label="Download original" title="Download original"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/15 active:scale-90"><Icon name="download" /></a>
          <IconButton icon="x" label="Close (Esc)" variant="glass" className="bg-transparent" onClick={onClose} />
        </div>
      </div>

      {/* stage */}
      <div className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2 transition-[padding] duration-300 sm:px-6 ${info ? "sm:pr-[24rem]" : ""}`}
        onMouseMove={onMove} onClick={toggleZoom} style={{ cursor: zoomed ? "zoom-out" : "zoom-in" }}>
        <img src={photo.thumbUrl} alt="" aria-hidden="true"
          className={`absolute max-h-full max-w-full scale-105 object-contain blur-xl transition-opacity duration-500 ${loaded ? "opacity-0" : "opacity-70"}`} />
        <img key={photo.id} src={photo.fileUrl} alt={photo.filename} onLoad={() => setLoaded(true)}
          ref={(el) => { if (el?.complete && el.naturalWidth > 0) setLoaded(true); }}
          draggable={false}
          style={{ transform: zoomed ? "scale(2.4)" : "scale(1)", transformOrigin: origin }}
          className={`relative max-h-full max-w-full select-none object-contain transition-[transform,opacity] duration-300 ease-out ${loaded ? "opacity-100" : "opacity-0"}`} />
        {!loaded && <div className="absolute h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" role="status" aria-label="Loading photo" />}

        {index > 0 && <button onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous photo"
          className="absolute left-2 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/40 backdrop-blur transition hover:scale-110 hover:bg-black/60 active:scale-90 max-sm:h-10 max-sm:w-10"><Icon name="left" className="h-6 w-6" /></button>}
        {index < count - 1 && <button onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next photo"
          className={`absolute top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-black/40 backdrop-blur transition hover:scale-110 hover:bg-black/60 active:scale-90 max-sm:h-10 max-sm:w-10 ${info ? "right-2 sm:right-[23rem]" : "right-2"}`}><Icon name="right" className="h-6 w-6" /></button>}
      </div>

      {/* filmstrip */}
      {count > 1 && (
        <div ref={strip} className="no-scrollbar z-10 flex gap-1.5 overflow-x-auto bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-2">
          {photos.map((p, i) => (
            <button key={p.id} onClick={() => onIndex(i)} aria-label={`Show ${p.filename}`} aria-current={i === index}
              className={`h-12 w-16 shrink-0 overflow-hidden rounded-lg transition duration-200 ${i === index ? "scale-105 opacity-100 ring-2 ring-white" : "opacity-50 hover:opacity-90"}`}>
              <img src={p.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* details panel */}
      {info && (
        <aside className="absolute bottom-0 right-0 top-0 z-20 w-full animate-slide-in-right overflow-y-auto border-l border-white/10 bg-neutral-900/95 p-5 backdrop-blur-xl max-sm:top-auto max-sm:max-h-[65%] max-sm:rounded-t-3xl sm:w-88"
          onClick={(e) => e.stopPropagation()} aria-label="Photo details">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Details</h2>
            <IconButton icon="x" label="Close details" variant="glass" className="bg-transparent" onClick={() => setInfo(false)} />
          </div>
          <dl className="space-y-3 text-sm">
            <Row label="File name" value={photo.filename} />
            <Row label={photo.dateSource === "exif" ? "Date taken (from EXIF)" : "Date"} value={formatDate(photo.sortDate)} hint={photo.dateSource === "upload" ? "No EXIF date in this photo, so the upload date is used for sorting." : undefined} />
            {photo.dateSource === "exif" && <Row label="Uploaded" value={formatDate(photo.uploadedAt)} />}
            {photo.width && photo.height && <Row label="Dimensions" value={`${photo.width} × ${photo.height} px`} />}
            <Row label="File size" value={formatBytes(photo.size)} />
          </dl>

          <h3 className="mb-2 mt-5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/50"><Icon name="tag" className="h-3.5 w-3.5" />Tags</h3>
          <div className="flex flex-wrap items-center gap-2">
            {photo.tags.length === 0 && !owner && <span className="text-sm text-white/40">No tags</span>}
            {photo.tags.map((t) => (
              <span key={t} className="inline-flex animate-pop items-center gap-1 rounded-full bg-white/10 py-1 pl-3 pr-1.5 text-sm">
                {t}
                {owner && <button aria-label={`Remove tag ${t}`} className="grid h-5 w-5 place-items-center rounded-full hover:bg-white/20" onClick={() => saveTags(photo.tags.filter((x) => x !== t))}><Icon name="x" className="h-3 w-3" /></button>}
              </span>
            ))}
            {owner && (
              <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()} onBlur={addTag}
                placeholder="Add tag…" aria-label="Add tag" maxLength={30}
                className="min-h-8 w-28 rounded-full bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/40 focus:bg-white/15" />
            )}
          </div>
          {tagError && <p className="mt-2 text-sm text-red-300" role="alert">{tagError}</p>}
          <p className="mt-6 text-xs leading-relaxed text-white/35">Shortcuts: ← → move · Space slideshow · Z zoom · I details{owner ? " · F favorite" : ""} · Esc close</p>
        </aside>
      )}
    </div></Portal>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-xs text-white/50">{label}</dt>
      <dd className="break-words font-medium">{value}</dd>
      {hint && <p className="mt-0.5 text-xs text-white/40">{hint}</p>}
    </div>
  );
}
