import { useCallback, useRef, useState } from "react";
import { errorMessage, uploadPhotos } from "./api";
import { Button, Icon, Portal, useToast } from "./ui";

const isImage = (f: File) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(f.name);

/** Uploads photos and reports progress + results as toasts. Shared by the form and by drag-and-drop. */
export function useUploader(onDone: () => void, albumId?: number) {
  const toast = useToast();
  const [state, setState] = useState<{ count: number; percent: number } | null>(null);

  const upload = useCallback(async (files: File[], tags = "") => {
    const images = files.filter(isImage);
    if (images.length === 0) { toast("Those files aren't photos. Use JPEG, PNG, WebP or GIF.", "error"); return false; }
    setState({ count: images.length, percent: 0 });
    try {
      const r = await uploadPhotos(images, { tags, albumId }, (percent) => setState({ count: images.length, percent }));
      toast(`${r.photos.length} photo${r.photos.length === 1 ? "" : "s"} uploaded`, "success");
      r.errors.forEach((e) => toast(`${e.filename}: ${e.message}`, "error"));
      onDone();
      return true;
    } catch (e) {
      toast(errorMessage(e), "error");
      return false;
    } finally {
      setState(null);
    }
  }, [albumId, onDone, toast]);

  return { upload, state };
}

export function UploadProgress({ state }: { state: { count: number; percent: number } | null }) {
  if (!state) return null;
  return (
    <Portal><div className="fixed bottom-24 right-4 z-[65] w-72 animate-toast rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-slate-200" role="status">
      <div className="mb-2 flex items-center justify-between text-sm font-medium">
        <span className="flex items-center gap-2"><Icon name="upload" className="h-4 w-4 text-indigo-600" />Uploading {state.count} photo{state.count > 1 ? "s" : ""}</span>
        <span className="tabular-nums text-slate-500">{state.percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 transition-[width] duration-200" style={{ width: `${state.percent}%` }} />
      </div>
      {state.percent >= 100 && <p className="mt-2 text-xs text-slate-500">Creating thumbnails…</p>}
    </div></Portal>
  );
}

/** Full-screen "drop here" hint shown while files are dragged over the page. */
export function DropOverlay({ show, text = "Drop photos to upload" }: { show: boolean; text?: string }) {
  if (!show) return null;
  return (
    <Portal><div className="pointer-events-none fixed inset-0 z-[80] grid animate-fade-in place-items-center bg-indigo-600/20 p-6 backdrop-blur-sm">
      <div className="animate-scale-in rounded-3xl border-4 border-dashed border-indigo-500 bg-white/90 px-10 py-12 text-center shadow-2xl">
        <div className="mx-auto mb-3 grid h-16 w-16 animate-pulse-ring place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white"><Icon name="upload" className="h-8 w-8" /></div>
        <p className="text-xl font-bold text-slate-900">{text}</p>
        <p className="mt-1 text-sm text-slate-500">JPEG, PNG, WebP or GIF</p>
      </div>
    </div></Portal>
  );
}

/** The upload form: choose files, optionally tag them all, upload. */
export function UploadPanel({ upload, busy, onClose }: { upload: (files: File[], tags: string) => Promise<boolean>; busy: boolean; onClose?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [tags, setTags] = useState("");
  const [over, setOver] = useState(false);

  const pick = (list: FileList | null) => list && setFiles(Array.from(list).filter(isImage));
  const submit = async () => {
    if (await upload(files, tags)) {
      setFiles([]); setTags("");
      if (input.current) input.current.value = "";
      onClose?.();
    }
  };
  const previews = files.slice(0, 6);

  return (
    <section aria-label="Upload photos" className="animate-scale-in rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
      <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); pick(e.dataTransfer.files); }}
        className={`rounded-2xl border-2 border-dashed px-4 py-8 text-center transition duration-200 ${over ? "scale-[1.01] border-indigo-500 bg-indigo-50" : "border-slate-300 bg-slate-50/60"}`}>
        {files.length === 0 ? (
          <>
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-indigo-100 text-indigo-600"><Icon name="upload" className="h-6 w-6" /></div>
            <p className="font-medium text-slate-800">Drop photos here</p>
            <p className="mb-3 text-sm text-slate-500">or choose them from your device. You can also drop files anywhere on the page.</p>
            <Button variant="primary" onClick={() => input.current?.click()} disabled={busy}><Icon name="plus" className="h-4 w-4" />Choose photos</Button>
          </>
        ) : (
          <>
            <div className="mb-3 flex justify-center -space-x-3">
              {previews.map((f, i) => <Preview key={i} file={f} i={i} />)}
              {files.length > previews.length && <span className="grid h-14 w-14 place-items-center rounded-xl bg-slate-800 text-sm font-semibold text-white ring-2 ring-white">+{files.length - previews.length}</span>}
            </div>
            <p className="font-medium text-slate-800">{files.length} photo{files.length > 1 ? "s" : ""} ready</p>
            <button onClick={() => input.current?.click()} className="text-sm text-indigo-700 hover:underline" disabled={busy}>Choose different photos</button>
          </>
        )}
        <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" aria-label="Choose photos" onChange={(e) => pick(e.target.files)} />
      </div>

      {files.length > 0 && (
        <div className="mt-3 flex animate-fade-up flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Icon name="tag" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tag all of these (comma separated)" aria-label="Tags for these photos" disabled={busy}
              className="min-h-11 w-full rounded-xl bg-white pl-9 pr-3 text-sm ring-1 ring-slate-200 transition focus:ring-2 focus:ring-indigo-500" />
          </div>
          <Button variant="primary" onClick={submit} disabled={busy} className="min-h-11">{busy ? "Uploading…" : `Upload ${files.length}`}</Button>
          {onClose && <Button variant="ghost" onClick={onClose} className="min-h-11">Cancel</Button>}
        </div>
      )}
    </section>
  );
}

function Preview({ file, i }: { file: File; i: number }) {
  const [url] = useState(() => URL.createObjectURL(file));
  return <img src={url} alt="" onLoad={() => URL.revokeObjectURL(url)} style={{ animationDelay: `${i * 50}ms` }} className="h-14 w-14 animate-pop rounded-xl object-cover shadow ring-2 ring-white" />;
}
