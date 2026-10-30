import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api, qs } from "../api";
import { useLoad } from "../hooks";
import type { Photo, Sort } from "../types";
import { Empty, GridSkeleton, Icon, Logo, SortSelect } from "../ui";
import { PhotoGrid } from "../PhotoGrid";
import { Lightbox } from "../Lightbox";

/** Public, read-only page for a shared album. No login, no editing. */
export default function Shared() {
  const { token } = useParams();
  const [sort, setSort] = useState<Sort>("date_desc");
  const [viewer, setViewer] = useState<number | null>(null);
  const [revoked, setRevoked] = useState(false);
  const view = useLoad(() => api.get<{ album: { title: string; photoCount: number }; photos: Photo[] }>(`/api/public/albums/${token}${qs({ sort })}`), [token, sort]);
  const photos = useMemo(() => view.data?.photos ?? [], [view.data]);
  const hero = photos[0];

  // Actively check if public sharing was turned off by the owner in real time
  useEffect(() => {
    if (revoked || !view.data) return;
    const checkStatus = async () => {
      try {
        await api.get(`/api/public/albums/${token}`);
      } catch {
        setRevoked(true);
      }
    };

    const interval = setInterval(() => void checkStatus(), 2500);
    window.addEventListener("focus", checkStatus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", checkStatus);
    };
  }, [token, revoked, view.data]);

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-3 py-3 sm:px-6"><Logo /><span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500 shadow-sm ring-1 ring-slate-200"><Icon name="eye" className="h-3.5 w-3.5" />View only</span></header>
      <main className="mx-auto max-w-7xl space-y-5 px-3 pb-16 sm:px-6">
        {!view.data && view.loading ? <GridSkeleton /> : (revoked || view.error || !view.data) ? (
          <div className="mx-auto max-w-md pt-16"><Empty icon="lock" title="This link isn't available">The album may have been made private, or the link may be wrong. Ask the owner for a new link.</Empty></div>
        ) : (
          <>
            <section className="relative animate-fade-up overflow-hidden rounded-3xl bg-slate-900 text-white shadow-lg">
              {hero && <img src={hero.thumbUrl} alt="" className="absolute inset-0 h-full w-full scale-125 object-cover opacity-90 blur-xl saturate-150" />}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/20 to-transparent" />
              <div className="relative p-6 sm:p-10">
                <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm backdrop-blur"><Icon name="sparkles" className="h-3.5 w-3.5" />Shared with you</p>
                <h1 className="break-words text-3xl font-bold tracking-tight sm:text-5xl">{view.data.album.title}</h1>
                <p className="mt-2 text-white/70">{view.data.album.photoCount} photo{view.data.album.photoCount === 1 ? "" : "s"}</p>
                {photos.length > 0 && (
                  <a href={`/api/public/albums/${token}/zip`} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-slate-900 shadow transition hover:bg-slate-100 active:scale-[.97]"><Icon name="download" className="h-4 w-4" />Download all (ZIP)</a>
                )}
              </div>
            </section>

            <div className="flex justify-end"><SortSelect value={sort} onChange={setSort} /></div>
            {photos.length === 0 ? <Empty icon="image" title="This album has no photos yet" /> : (
              <div className={`transition-opacity duration-300 ${view.loading ? "opacity-60" : ""}`}><PhotoGrid photos={photos} onOpen={setViewer} groupBy={photos.length > 24 ? "month" : "none"} /></div>
            )}
            {viewer !== null && <Lightbox photos={photos} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />}
          </>
        )}
      </main>
    </div>
  );
}
