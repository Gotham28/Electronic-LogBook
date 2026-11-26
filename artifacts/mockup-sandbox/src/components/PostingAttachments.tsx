import * as React from "react";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiDelete, apiGet, apiGetBlob, apiPostFile } from "@/lib/apiClient";

type PostingFile = { id: string; fileName: string; contentType: string; byteSize: number };

export function PostingAttachments({ studentId, postingId, editable }: {
  studentId: number; postingId: number; editable?: boolean;
}) {
  const path = `/api/students/${studentId}/postings/${postingId}/attachments`;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline"><Paperclip className="size-4" /> Attachments</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Posting attachments</DialogTitle>
          <DialogDescription>
            {editable ? "Add up to five files. JPEGs can be up to 1 MB and PDFs up to 3 MB." : "Download files attached to this posting."}
          </DialogDescription>
        </DialogHeader>
        <AttachmentList path={path} editable={editable === true} />
      </DialogContent>
    </Dialog>
  );
}

function AttachmentList({ path, editable }: { path: string; editable: boolean }) {
  const inputId = React.useId();
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [files, setFiles] = React.useState<PostingFile[]>();
  const [selected, setSelected] = React.useState<File>();
  const [loadError, setLoadError] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [actionError, setActionError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(async (signal?: AbortSignal) => {
    setLoadError("");
    try {
      setFiles(await apiGet<PostingFile[]>(path, { signal }));
    } catch (error) {
      if (!signal?.aborted) setLoadError(error instanceof Error ? error.message : "Could not load attachments.");
    }
  }, [path]);

  React.useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function run(action: () => Promise<void>) {
    setActionError("");
    setStatus("");
    setBusy(true);
    try { await action(); }
    catch (error) { setActionError(error instanceof Error ? error.message : "Could not complete the file action."); }
    finally { setBusy(false); }
  }

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busy) return;
    await run(async () => {
      const isPdf = (await selected.slice(0, 5).text()) === "%PDF-";
      const limitMb = isPdf ? 3 : 1;
      if (selected.size > limitMb * 1024 * 1024) {
        throw new Error(isPdf ? "PDF files must be 3 MB or smaller." : "JPEG files must be 1 MB or smaller.");
      }
      const saved = await apiPostFile<PostingFile>(path, selected);
      setFiles((current) => [...(current ?? []), saved]);
      setSelected(undefined);
      if (fileInput.current) fileInput.current.value = "";
      setStatus("Attachment uploaded.");
    });
  }

  async function download(file: PostingFile) {
    await run(async () => {
      const blob = await apiGetBlob(`${path}/${file.id}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.fileName;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setStatus("Download started.");
    });
  }

  async function remove(file: PostingFile) {
    await run(async () => {
      await apiDelete(`${path}/${file.id}`);
      setFiles((current) => current?.filter(({ id }) => id !== file.id));
      setStatus("Attachment removed.");
    });
  }

  if (loadError) return <div className="space-y-2"><p role="alert" className="text-sm text-rose-700">{loadError}</p><Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button></div>;
  if (!files) return <p role="status" className="text-sm text-slate-600">Loading attachments…</p>;

  return (
    <div className="min-w-0 space-y-4">
      {files.length ? (
        <ul className="divide-y divide-slate-200 border-y border-slate-200">
          {files.map((file) => (
            <li key={file.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 flex-1 break-all text-sm text-slate-900">{file.fileName}</span>
              <Button type="button" size="sm" variant="outline" disabled={busy} aria-label={`Download ${file.fileName}`} onClick={() => void download(file)}>Download</Button>
              {editable && <Button type="button" size="sm" variant="ghost" disabled={busy} aria-label={`Remove ${file.fileName}`} onClick={() => void remove(file)}>Remove</Button>}
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-slate-600">No files attached.</p>}
      {editable && files.length < 5 && (
        <form className="space-y-2" onSubmit={upload}>
          <Label htmlFor={inputId}>Choose a file</Label>
          <Input ref={fileInput} id={inputId} type="file" accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg"
            disabled={busy} onChange={(event) => setSelected(event.target.files?.[0])} />
          <Button type="submit" size="sm" disabled={busy || !selected}>Upload file</Button>
        </form>
      )}
      {actionError && <p role="alert" className="text-sm text-rose-700">{actionError}</p>}
      <p role="status" className="text-sm text-slate-600 empty:hidden">{busy ? "Working…" : status}</p>
    </div>
  );
}
