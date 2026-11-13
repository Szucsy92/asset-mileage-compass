import type { Device } from "@/lib/fleet";
import type { WorkbookRef } from "./workbookLayout";
import { loadWorkbookTemplate } from "./workbookStorage";
import { buildWorkbookAsync } from "./xlsxWorkerClient";

export { EXTRAS_MARKER } from "./workbookLayout";
export { buildWorkbook } from "./xlsxBuild";

type NativeDownloads = { save: (fileName: string, base64: string) => string };

const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
  r.onerror = () => reject(new Error("A fájl előkészítése nem sikerült."));
  r.readAsDataURL(blob);
});

/** Fizikai letöltés: APK-ban a Letöltések mappába ment (natív híd), böngészőben a szokásos letöltés. */
export async function exportWorkbook(devices: Device[], year: number, ref?: WorkbookRef): Promise<string> {
  const blob = await buildWorkbookAsync(devices, year, await loadWorkbookTemplate(ref));
  const name = ref?.name ?? `Technikai_eszkozok_${year}.xlsx`;
  const native = (window as unknown as { NativeDownloads?: NativeDownloads }).NativeDownloads;
  if (native) {
    const res = native.save(name, await blobToBase64(blob));
    if (!res.startsWith("ok:")) throw new Error(`A mentés nem sikerült: ${res.replace(/^err:/, "")}`);
    return `Letöltve: Letöltések/${res.slice(3)}`;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return "Letöltve";
}

/** Az app adatait a kiválasztott Drive-fájlba írja (a fájl formázása és megosztása megmarad). */
export async function saveWorkbookToDrive(devices: Device[], year: number, ref: WorkbookRef, opts: { silent?: boolean } = {}): Promise<string> {
  if (!ref.driveId) throw new Error("Nincs Drive-fájl kiválasztva.");
  const { downloadFile, uploadFile } = await import("./drive");
  const { blob, meta } = await downloadFile(ref.driveId, opts);
  if (!meta.canEdit) throw new Error("Ehhez a Drive-fájlhoz csak megtekintési jogod van. Kérj szerkesztői hozzáférést.");
  const out = await buildWorkbookAsync(devices, year, await blob.arrayBuffer());
  return uploadFile(ref.driveId, out, opts);
}
