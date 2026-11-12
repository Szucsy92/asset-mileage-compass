import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { DriveFile } from "@/lib/drive";

/** Drive-fájl keresése és kiválasztása (.xlsx, saját és megosztott) */
export function DrivePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (f: DriveFile) => void }) {
  const [term, setTerm] = useState("");
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const search = async (t: string) => {
    setBusy(true); setError("");
    try { const { searchXlsx } = await import("@/lib/drive"); setFiles(await searchXlsx(t)); }
    catch (e) { setFiles([]); setError(e instanceof Error ? e.message : "A keresés nem sikerült."); }
    finally { setBusy(false); }
  };

  useEffect(() => { if (open) void search(""); }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Excel kiválasztása a Drive-ról</DialogTitle></DialogHeader>
        <div className="flex gap-1.5">
          <input value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void search(term); }}
            placeholder="Fájlnév részlete…" className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-sm" />
          <Button size="sm" disabled={busy} onClick={() => void search(term)}>{busy ? "…" : "Keresés"}</Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {!busy && !error && !files.length && <p className="text-xs text-muted-foreground">Nincs találat (.xlsx fájlokat keresek).</p>}
          {files.map((f) => (
            <button key={f.id} onClick={() => onPick(f)} className="w-full rounded-md border px-2 py-1.5 text-left hover:bg-accent">
              <div className="truncate text-sm font-medium">{f.name}</div>
              <div className="text-[10px] text-muted-foreground">{f.owner ? `${f.owner} · ` : ""}{new Date(f.modifiedTime).toLocaleString("hu-HU")}{f.canEdit ? "" : " · csak olvasható"}</div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
