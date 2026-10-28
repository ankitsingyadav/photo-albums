import { useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { Photo } from "./types";
import { Icon, formatDate, monthLabel } from "./ui";

interface Props {
  photos: Photo[];
  onOpen: (index: number) => void;
  selected?: Set<number>;
  onSelect?: (id: number, shift: boolean) => void;
  onSelectMany?: (ids: number[], on: boolean) => void;
  onFavorite?: (photo: Photo) => void;
  coverId?: number | null;
  groupBy?: "month" | "year" | "none";
  rowHeight?: number; // desktop row height in px
}

/**
 * The gallery. Photos sit in justified rows that keep their real proportions
 * (no square cropping). It only ever loads thumbnails (photo.thumbUrl).
 */
export function PhotoGrid({ photos, onOpen, selected, onSelect, onSelectMany, onFavorite, coverId, groupBy = "none", rowHeight = 200 }: Props) {
  const selecting = (selected?.size ?? 0) > 0;
  const indexOf = useMemo(() => new Map(photos.map((p, i) => [p.id, i])), [photos]);

  const sections = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", label: "", photos }];
    const out: { key: string; label: string; photos: Photo[] }[] = [];
    for (const p of photos) {
      const key = p.sortDate.slice(0, groupBy === "year" ? 4 : 7); // "2023" or "2023-09"
      const last = out[out.length - 1];
      if (last && last.key === key) last.photos.push(p);
      else out.push({ key, label: groupBy === "year" ? p.sortDate.slice(0, 4) : monthLabel(p.sortDate), photos: [p] });
    }
    return out;
  }, [photos, groupBy]);

  let animIndex = 0;
  return (
    <div className="space-y-5" style={{ ["--d" as string]: `${rowHeight}px` } as CSSProperties}>
      {sections.map((sec) => {
        const ids = sec.photos.map((p) => p.id);
        const allOn = !!selected && ids.every((id) => selected.has(id));
        return (
          <section key={sec.key}>
            {groupBy !== "none" && (
              <div className="sticky top-14 z-10 -mx-1 mb-2 flex items-center justify-between rounded-xl bg-slate-50/80 px-1 py-2 backdrop-blur-md">
                <h3 className="text-sm font-semibold text-slate-700">
                  {sec.label} <span className="ml-1 font-normal text-slate-400">{sec.photos.length}</span>
                </h3>
                {onSelectMany && (
                  <button onClick={() => onSelectMany(ids, !allOn)} className="rounded-lg px-2 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-50">
                    {allOn ? "Deselect" : "Select all"}
                  </button>
                )}
              </div>
            )}
            <ul className="flex flex-wrap gap-1.5 [--s:.62] after:grow-[999] after:content-[''] sm:gap-2 sm:[--s:1]">
              {sec.photos.map((p) => (
                <Tile key={p.id} photo={p} index={animIndex++} selected={selected?.has(p.id) ?? false} selecting={selecting}
                  isCover={coverId === p.id} onFavorite={onFavorite}
                  onClick={(shift) => (selecting && onSelect ? onSelect(p.id, shift) : onOpen(indexOf.get(p.id) ?? 0))}
                  onCheck={onSelect ? (shift) => onSelect(p.id, shift) : undefined} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

interface TileProps {
  photo: Photo;
  index: number;
  selected: boolean;
  selecting: boolean;
  isCover: boolean;
  onClick: (shift: boolean) => void;
  onCheck?: (shift: boolean) => void;
  onFavorite?: (photo: Photo) => void;
}

function Tile({ photo: p, index, selected, selecting, isCover, onClick, onCheck, onFavorite }: TileProps) {
  const [loaded, setLoaded] = useState(false);
  const ar = Math.min(2.4, Math.max(0.6, p.width && p.height ? p.width / p.height : 1.5)); // clamp so panoramas don't break rows
  const style: CSSProperties = {
    flexGrow: ar,
    flexBasis: `calc(var(--d) * var(--s) * ${ar})`,
    height: "calc(var(--d) * var(--s))",
    animationDelay: `${Math.min(index, 24) * 28}ms`,
  };
  const key = (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(e.shiftKey); } };

  return (
    <li style={style} className={`group relative animate-fade-up overflow-hidden rounded-xl transition-colors duration-200 ${selected ? "bg-indigo-100" : "bg-slate-200"}`}>
      <div role="button" tabIndex={0} aria-label={`${selecting ? "Select" : "Open"} ${p.filename}`} aria-pressed={selecting ? selected : undefined}
        onClick={(e) => onClick(e.shiftKey)} onKeyDown={key} className="absolute inset-0 cursor-pointer">
        {!loaded && <div className="shimmer absolute inset-0" />}
        <div className={`absolute inset-0 transition-all duration-300 ease-out ${selected ? "scale-[.84] overflow-hidden rounded-lg" : ""}`}>
          <img src={p.thumbUrl} alt={p.filename} decoding="async" loading="lazy" draggable={false}
            ref={(el) => { if (el?.complete && el.naturalWidth > 0 && !loaded) setLoaded(true); }}
            onLoad={() => setLoaded(true)}
            className={`h-full w-full object-cover transition-[opacity,transform] duration-700 ease-out group-hover:scale-[1.06] ${loaded ? "scale-100 opacity-100" : "scale-110 opacity-0"}`} />
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent px-2.5 pb-2 pt-8 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <p className="truncate text-xs font-medium text-white">{formatDate(p.sortDate)}{p.dateSource === "upload" && <span className="opacity-70"> · upload date</span>}</p>
        </div>
      </div>

      {onCheck && (
        <button onClick={(e) => { e.stopPropagation(); onCheck(e.shiftKey); }} aria-label={`${selected ? "Deselect" : "Select"} ${p.filename}`} aria-pressed={selected}
          className={`absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-full border-2 transition duration-200 active:scale-90 ${selected
            ? "border-indigo-600 bg-indigo-600 text-white opacity-100"
            : `border-white bg-black/25 text-transparent backdrop-blur-sm hover:bg-black/40 ${selecting ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"}`}`}>
          {selected && <Icon name="check" className="h-4 w-4 animate-pop" />}
        </button>
      )}

      {onFavorite && (
        <button onClick={(e) => { e.stopPropagation(); onFavorite(p); }} aria-label={p.favorite ? `Remove ${p.filename} from favorites` : `Add ${p.filename} to favorites`} aria-pressed={!!p.favorite}
          className={`absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full transition duration-200 hover:scale-110 active:scale-90 ${p.favorite
            ? "bg-white/90 text-rose-500 opacity-100 shadow"
            : "bg-black/25 text-white opacity-0 backdrop-blur-sm hover:bg-black/40 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"}`}>
          <Icon name="heart" className={`h-4 w-4 ${p.favorite ? "animate-pop" : ""}`} fill={!!p.favorite} />
        </button>
      )}

      {isCover && (
        <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-amber-950 shadow">
          <Icon name="star" className="h-3 w-3" fill />Cover
        </span>
      )}
    </li>
  );
}
