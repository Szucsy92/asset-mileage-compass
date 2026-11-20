import type { Device } from "@/lib/fleet";
import type { WorkbookRef } from "./workbookLayout";
import { loadWorkbookTemplate } from "./workbookStorage";
import { loadBase, saveBase } from "./syncBase";
import { buildWorkbookAsync, parseBufferAsync } from "./xlsxWorkerClient";

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
/**
 * A táblázat az irányadó: friss táblázat beolvasása és háromutas összefésülés az appal.
 * mode "load": alap hiányában az app változatlannak számít (a táblázat nyer); "upload": alap hiányában a táblázat az alap (az app módosítása érvényes).
 * Visszaadja a táblázat jelenlegi állapotát (table) és az összefésült eszközöket (result).
 */
export async function reconcileWithTable(devices: Device[], year: number, buffer: ArrayBuffer, mode: "load" | "upload") {
  const { mergeImport, threeWay } = await import("./importXlsx");
  const parsed = await parseBufferAsync(buffer.slice(0));
  const table = parsed.length ? mergeImport(devices, parsed, true, () => false).devices : devices;
  const base = loadBase(year) ?? (mode === "load" ? devices : table);
  return { table, result: threeWay(base, devices, table), found: parsed.length };
}

export async function exportWorkbook(devices: Device[], year: number, ref?: WorkbookRef): Promise<string> {
  const buffer = await loadWorkbookTemplate(ref);
  const { table, result } = await reconcileWithTable(devices, year, buffer, "upload");
  const blob = await buildWorkbookAsync(result, year, buffer, table);
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

/**
 * Az app módosításait a Drive-fájlba írja úgy, hogy a táblázat marad az irányadó: előbb friss letöltés és összefésülés,
 * csak az appban módosult részek íródnak be. Visszaadja az összefésült eszközöket (a táblázatban közben pótolt adatokkal).
 */
export async function saveWorkbookToDrive(devices: Device[], year: number, ref: WorkbookRef, opts: { silent?: boolean } = {}): Promise<Device[]> {
  if (!ref.driveId) throw new Error("Nincs Drive-fájl kiválasztva.");
  const { downloadFile, uploadFile } = await import("./drive");
  const { blob, meta } = await downloadFile(ref.driveId, opts);
  if (!meta.canEdit) throw new Error("Ehhez a Drive-fájlhoz csak megtekintési jogod van. Kérj szerkesztői hozzáférést.");
  const buffer = await blob.arrayBuffer();
  const { table, result } = await reconcileWithTable(devices, year, buffer, "upload");
  const out = await buildWorkbookAsync(result, year, buffer, table);
  await uploadFile(ref.driveId, out, opts);
  saveBase(year, result);
  return result;
}
