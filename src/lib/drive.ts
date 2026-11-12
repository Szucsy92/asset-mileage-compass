import { dropAccessToken, getAccessToken } from "./googleAuth";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export type DriveFile = { id: string; name: string; modifiedTime: string; owner: string; canEdit: boolean };

type ApiFile = { id: string; name: string; modifiedTime: string; ownedByMe?: boolean; owners?: { displayName?: string }[]; capabilities?: { canEdit?: boolean } };
const API = "https://www.googleapis.com/drive/v3";
const FIELDS = "id,name,modifiedTime,ownedByMe,owners(displayName),capabilities(canEdit)";
const toFile = (f: ApiFile): DriveFile => ({
  id: f.id, name: f.name, modifiedTime: f.modifiedTime,
  owner: f.ownedByMe ? "te" : (f.owners?.[0]?.displayName ?? ""), canEdit: f.capabilities?.canEdit ?? false,
});

async function explain(res: Response): Promise<string> {
  if (res.status === 403) return "Nincs jogosultságod ehhez a Drive-fájlhoz (szerkesztői hozzáférés kell).";
  if (res.status === 404) return "A Drive-fájl nem található, vagy nincs megosztva veled.";
  if (res.status === 401) return "A Google-bejelentkezés lejárt, jelentkezz be újra.";
  return `Drive hiba (${res.status}).`;
}

async function call(url: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401 && !retried) { dropAccessToken(); return call(url, init, true); }
  if (!res.ok) throw new Error(await explain(res));
  return res;
}

/** .xlsx fájlok keresése a Drive-on (saját és megosztott), legújabb elöl */
export async function searchXlsx(term: string): Promise<DriveFile[]> {
  const t = term.trim().replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const q = `mimeType='${XLSX_MIME}' and trashed=false${t ? ` and name contains '${t}'` : ""}`;
  const params = new URLSearchParams({ q, orderBy: "modifiedTime desc", pageSize: "30", fields: `files(${FIELDS})`, supportsAllDrives: "true", includeItemsFromAllDrives: "true" });
  const data = (await (await call(`${API}/files?${params.toString()}`)).json()) as { files?: ApiFile[] };
  return (data.files ?? []).map(toFile);
}

export async function getFileMeta(id: string): Promise<DriveFile> {
  const res = await call(`${API}/files/${encodeURIComponent(id)}?fields=${encodeURIComponent(FIELDS)}&supportsAllDrives=true`);
  return toFile((await res.json()) as ApiFile);
}

export async function downloadFile(id: string): Promise<{ blob: Blob; meta: DriveFile }> {
  const meta = await getFileMeta(id);
  const res = await call(`${API}/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`);
  return { blob: await res.blob(), meta };
}

/** A fájl tartalmának cseréje (ugyanaz a fájl és megosztás marad). Visszaadja az új módosítási időt. */
export async function uploadFile(id: string, blob: Blob): Promise<string> {
  const res = await call(
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(id)}?uploadType=media&supportsAllDrives=true&fields=modifiedTime`,
    { method: "PATCH", headers: { "Content-Type": XLSX_MIME }, body: blob },
  );
  return ((await res.json()) as { modifiedTime: string }).modifiedTime;
}
