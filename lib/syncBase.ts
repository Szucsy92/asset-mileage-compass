import type { Device } from "@/lib/fleet";

const key = (year: number) => `fleet-sync-base-${year}`;
/** A táblázat utoljára ismert állapota (az utolsó sikeres betöltés/feltöltés után), évenként */
export function loadBase(year: number): Device[] | null {
  try { const raw = localStorage.getItem(key(year)); const v = raw ? (JSON.parse(raw) as unknown) : null; return Array.isArray(v) ? (v as Device[]) : null; } catch { return null; }
}
export function saveBase(year: number, devices: Device[]) {
  // Csak a táblázatból származó adatok kellenek az összehasonlításhoz
  const slim = devices.map((d) => ({ id: d.id, plate: d.plate, type: d.type, category: d.category, unit: d.unit, norm: d.norm, yearlyAllowed: d.yearlyAllowed, startOdometer: d.startOdometer, docs: [], months: d.months, ...(d.services ? { services: d.services } : {}), ...(d.removedFrom != null ? { removedFrom: d.removedFrom } : {}) }));
  try { localStorage.setItem(key(year), JSON.stringify(slim)); } catch { /* tele a tár: a következő szinkron a táblázatot tekinti alapnak */ }
}
