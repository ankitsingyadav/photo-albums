import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, errorMessage } from "../api";
import { useLoad } from "../hooks";
import type { Album } from "../types";
import { Button, Empty, ErrorBanner, Icon } from "../ui";

export default function Albums() {
  const navigate = useNavigate();
  const albums = useLoad(() => api.get<{ albums: Album[] }>("/api/albums"), []);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await api.post<{ album: Album }>("/api/albums", { title });
      navigate(`/albums/${r.album.id}`);
    } catch (err) { setError(errorMessage(err)); }
  };

  const list = albums.data?.albums ?? [];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Albums</h1>
          <p className="mt-1 text-slate-500">Group photos and share them with a private link.</p>
        </div>
        <Button variant="primary" className="min-h-11" onClick={() => setCreating((v) => !v)}><Icon name={creating ? "x" : "plus"} className="h-4 w-4" />{creating ? "Cancel" : "New album"}</Button>
      </div>

      {creating && (
        <form onSubmit={create} className="flex animate-scale-in gap-2 rounded-3xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Album title, e.g. Summer 2024" aria-label="New album title" maxLength={100}
            className="min-h-11 flex-1 rounded-xl px-3 outline-none ring-1 ring-slate-200 transition focus:ring-2 focus:ring-indigo-500" />
          <Button type="submit" variant="primary">Create</Button>
        </form>
      )}
      <ErrorBanner message={error} onClose={() => setError(null)} />
      {albums.error && <ErrorBanner message={albums.error} />}

      {!albums.data && albums.loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="shimmer aspect-[4/3] rounded-3xl" style={{ animationDelay: `${i * 100}ms` }} />)}</div>
      ) : albums.data && list.length === 0 ? (
        <Empty icon="layers" title="No albums yet" action={<Button variant="primary" onClick={() => setCreating(true)}><Icon name="plus" className="h-4 w-4" />Create your first album</Button>}>
          Albums let you group photos by trip, event or theme, then share them with a link.
        </Empty>
      ) : (
        <ul className="grid grid-cols-2 gap-5 pt-2 md:grid-cols-3 lg:grid-cols-4">
          {list.map((a, i) => (
            <li key={a.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 12) * 60}ms` }}>
              <Link to={`/albums/${a.id}`} className="group relative block">
                {/* two offset "sheets" behind the cover give a stacked look */}
                <span aria-hidden className="absolute inset-x-3 -top-1.5 h-4 rounded-t-2xl bg-slate-300/70 transition-transform duration-300 group-hover:-translate-y-1" />
                <span aria-hidden className="absolute inset-x-1.5 -top-0.5 h-4 rounded-t-2xl bg-slate-200 transition-transform duration-300 group-hover:-translate-y-0.5" />
                <div className="relative overflow-hidden rounded-3xl bg-slate-200 shadow-sm ring-1 ring-slate-200/70 transition duration-300 group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-indigo-500/10">
                  {a.coverUrl
                    ? <img src={a.coverUrl} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover transition duration-700 group-hover:scale-110" />
                    : <div className="grid aspect-[4/3] place-items-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400"><Icon name="image" className="h-10 w-10" /></div>}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  {a.shareEnabled && <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow"><Icon name="globe" className="h-3.5 w-3.5" />Shared</span>}
                  <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                    <p className="truncate text-lg font-semibold drop-shadow">{a.title}</p>
                    <p className="text-sm text-white/80">{a.photoCount} photo{a.photoCount === 1 ? "" : "s"}</p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
