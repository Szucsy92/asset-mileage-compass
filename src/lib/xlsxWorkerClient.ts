import type { Device } from "@/lib/fleet";
import type { Parsed } from "@/lib/xlsxParse";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function failAll(message: string) {
  for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error(message)); }
  pending.clear();
  worker?.terminate();
  worker = null;
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./xlsx.worker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id); clearTimeout(p.timer);
    if (e.data.ok) p.resolve(e.data.result); else p.reject(new Error(e.data.error ?? "A feldolgozás nem sikerült."));
  };
  w.onerror = () => failAll("WORKER_FAILED");
  worker = w;
  return w;
}

function run<T>(job: Record<string, unknown>, transfer: ArrayBuffer): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("WORKER_TIMEOUT")); }, 180_000);
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
    try { getWorker().postMessage({ id, ...job }, [transfer]); } catch (error) { pending.delete(id); clearTimeout(timer); reject(error instanceof Error ? error : new Error("WORKER_FAILED")); }
  });
}

/** Beolvasás háttérszálon; ha a háttérszál nem elérhető, a fő szálon fut (lassabb, de működik). */
export async function parseBufferAsync(buffer: ArrayBuffer): Promise<Parsed[]> {
  if (typeof Worker !== "undefined") {
    try { const copy = buffer.slice(0); return await run<Parsed[]>({ kind: "parse", buffer: copy }, copy); } catch { /* tartalék: fő szál */ }
  }
  const { parseBuffer } = await import("./xlsxParse");
  return parseBuffer(buffer);
}

/** Kiírás háttérszálon; ha a háttérszál nem elérhető vagy elbukik, a fő szálon újrapróbálja. */
export async function buildWorkbookAsync(devices: Device[], year: number, buffer: ArrayBuffer): Promise<Blob> {
  if (typeof Worker !== "undefined") {
    try { const copy = buffer.slice(0); return await run<Blob>({ kind: "build", devices, year, buffer: copy }, copy); } catch { /* tartalék: fő szál */ }
  }
  const { buildWorkbook } = await import("./xlsxBuild");
  return buildWorkbook(devices, year, buffer);
}
