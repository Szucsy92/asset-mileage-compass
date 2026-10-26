import { MONTHS, newDevice, uid, type Device, type Doc, type Row } from "@/lib/fleet";
import type { Service } from "@/lib/maintenance";
import { norm } from "@/components/WheelPicker";
import { EXTRAS_MARKER } from "@/lib/exportXlsx";

type Extras = { docs: Doc[]; services: Service[]; note?: string; muted?: boolean; unit?: Device["unit"]; norm?: number; yearlyAllowed?: number; status?: Device["status"] };
type Parsed = { plate: string; type: string; category: string; start: number | null; months: Record<number, Row[]>; extras?: Extras };

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
  // App-extra blokk beolvasása: a jelölő sor bárhol lehet (a táblázat alján, nem fix helyen)
  for (const name of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, raw: true, defval: null });
    const mi = grid.findIndex((row) => row?.some((c) => typeof c === "string" && c.trim() === EXTRAS_MARKER));
    if (mi < 0) continue;
    for (let r = mi + 2; r < grid.length; r++) {
      const row = grid[r];
      const plate = String(row?.[0] ?? "").trim();
      const kind = String(row?.[1] ?? "").trim();
      if (!plate || !kind) continue;
      let d = byPlate.get(plate);
      if (!d) { d = { plate, type: "", category: "", start: null, months: {} }; byPlate.set(plate, d); order.push(plate); }
      const ex = (d.extras ??= { docs: [], services: [] });
      const v1 = String(row?.[2] ?? "").trim(), v2 = String(row?.[3] ?? "").trim(), v3 = String(row?.[4] ?? "").trim(), v4 = String(row?.[5] ?? "").trim();
      if (kind === "beállítás") {
        ex.unit = v1 === "üó" ? "üó" : "km";
        ex.norm = n(v2); ex.yearlyAllowed = n(v3);
        if (v4 === "H" || v4 === "NH" || v4 === "S") ex.status = v4;
      } else if (kind === "megjegyzés") ex.note = v1;
      else if (kind === "némítva") ex.muted = true;
      else if (kind === "okmány") ex.docs.push({ id: uid(), name: v1, number: v2, expiry: /^\d{4}-\d{2}-\d{2}$/.test(v3) ? v3 : "", hasNumber: v4[0] !== "0", hasDate: v4[1] !== "0" });
      else if (kind === "szerviz") ex.services.push({ id: uid(), name: v1, interval: n(v2), lastReading: n(v3) });
    }
  }
  return order.map((p) => byPlate.get(p)!);
}

/** Összefésülés: a fájlban szereplő eszközök minden hónapja frissül, okmányok/beállítások megmaradnak */
const similar = (a: string, b: string) => { const x = norm(a), y = norm(b); return x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x)); };
export function mergeImport(current: Device[], parsed: Parsed[], keepNames = true, ask: (p: Parsed, d: Device) => boolean = () => false) {
  let updated = 0, added = 0;
  const devices = [...current];
  for (const p of parsed) {
    let i = devices.findIndex((d) => norm(d.plate) === norm(p.plate));
    if (i < 0) {
      const taken = new Set(parsed.map((x) => norm(x.plate)));
      const j = devices.findIndex((d) => !taken.has(norm(d.plate)) && similar(d.plate, p.plate));
      if (j >= 0 && ask(p, devices[j]!)) i = j;
    }
    const months = Object.fromEntries(Object.entries(p.months).filter(([, r]) => r.length));
    if (i >= 0) {
      const d = devices[i]!;
      devices[i] = { ...d, ...(keepNames ? {} : { plate: p.plate, type: p.type || d.type, category: p.category || d.category }), startOdometer: p.start ?? d.startOdometer, months };
      updated++;
    } else {
      devices.push({ ...newDevice(p.plate, p.type), category: p.category, startOdometer: p.start ?? 0, months });
      added++;
    }
  }
  return { devices, updated, added };
}
