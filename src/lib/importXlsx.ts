import { MONTHS, newDevice, uid, type Device, type Row } from "@/lib/fleet";
import { norm } from "@/components/WheelPicker";

type Parsed = { plate: string; type: string; category: string; start: number | null; months: Record<number, Row[]> };

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/** Az eredeti nyilvántartó táblázat beolvasása (havi lapok, eszköz-blokkok) */
export async function parseWorkbook(file: File): Promise<Parsed[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const byPlate = new Map<string, Parsed>();
  const order: string[] = [];

  wb.SheetNames.forEach((name, sheetIdx) => {
    const mi = MONTHS.findIndex((m) => norm(m) === norm(name));
    const month = mi >= 0 ? mi : sheetIdx;
    if (month > 11) return;
    const ws = wb.Sheets[name]!;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
    const g = (r: number, c: number) => grid[r]?.[c] ?? null;

    grid.forEach((row, r) => row.forEach((cell, c) => {
      if (typeof cell !== "string" || !cell.includes("rendszám")) return;
      const plate = String(g(r, c + 3) ?? "").trim();
      if (!plate || g(r + 9, c) !== "Sorszám") return;
      let d = byPlate.get(plate);
      if (!d) {
        d = { plate, type: String(g(r + 1, c + 3) ?? "").replace(/\s+/g, " ").trim(), category: String(g(r + 2, c + 3) ?? "").trim(), start: null, months: {} };
        byPlate.set(plate, d); order.push(plate);
      }
      if (month === 0 || d.start == null) d.start = n(g(r + 12, c + 1));
      const rows: Row[] = [];
      for (let rr = r + 13; rr <= r + 45; rr++) {
        if (typeof g(rr, c - 1) === "string") break;
        const s = g(rr, c);
        if (typeof s === "string") break;
        const [km, tk, sk, f, m] = [1, 2, 3, 4, 5].map((k) => g(rr, c + k));
        if ([s, km, f].some((v) => v != null && v !== 0)) {
          rows.push({ id: uid(), docNo: s == null ? "" : String(s), odometer: n(km), km: n(tk), weightedKm: n(sk), fuel: n(f), diff: n(m) });
        }
      }
      d.months[month] = rows;
    }));
  });
  return order.map((p) => byPlate.get(p)!);
}

/** Összefésülés: a fájlban szereplő eszközök minden hónapja frissül, okmányok/beállítások megmaradnak */
export function mergeImport(current: Device[], parsed: Parsed[]) {
  let updated = 0, added = 0;
  const devices = [...current];
  for (const p of parsed) {
    const i = devices.findIndex((d) => norm(d.plate) === norm(p.plate));
    const months = Object.fromEntries(Object.entries(p.months).filter(([, r]) => r.length));
    if (i >= 0) {
      const d = devices[i]!;
      devices[i] = { ...d, type: p.type || d.type, category: p.category || d.category, startOdometer: p.start ?? d.startOdometer, months };
      updated++;
    } else {
      devices.push({ ...newDevice(p.plate, p.type), category: p.category, startOdometer: p.start ?? 0, months });
      added++;
    }
  }
  return { devices, updated, added };
}
