import * as XLSX from "xlsx";
import type { Device, Doc, Row } from "@/lib/fleet";
import type { Service } from "@/lib/maintenance";
import { MONTHS } from "@/lib/months";
import { uid } from "@/lib/ids";
import { norm } from "@/lib/text";
import { EXTRAS_MARKER } from "@/lib/workbookLayout";

export type Extras = { docs: Doc[]; services: Service[]; note?: string; muted?: boolean; unit?: Device["unit"]; norm?: number; yearlyAllowed?: number; status?: Device["status"]; complete?: boolean; removedFrom?: number };
export type Parsed = { plate: string; type: string; category: string; start: number | null; months: Record<number, Row[]>; extras?: Extras; allowed?: number; oilDue?: number };

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/** Az eredeti nyilvántartó táblázat beolvasása (havi lapok, eszköz-blokkok). Tiszta függvény: háttérszálban is fut. */
export function parseBuffer(buffer: ArrayBuffer): Parsed[] {
  const wb = XLSX.read(buffer, { type: "array", sheetStubs: true });
  const byPlate = new Map<string, Parsed>();
  const order: string[] = [];
  const tableAt = new Map<string, number>(); // a legkésőbbi hónap, amelyből az E4/E9 értéke származik

  wb.SheetNames.forEach((name, sheetIdx) => {
    const mi = MONTHS.findIndex((m) => norm(m) === norm(name));
    const month = mi >= 0 ? mi : sheetIdx;
    if (month > 11) return;
    const ws = wb.Sheets[name];
    if (!ws) return;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
    const g = (r: number, c: number) => grid[r]?.[c] ?? null;

    grid.forEach((row, r) => row.forEach((cell, c) => {
      if (typeof cell !== "string" || !cell.toLowerCase().includes("rendszám")) return;
      const plate = String(g(r, c + 3) ?? "").trim();
      if (!plate || g(r + 9, c) !== "Sorszám") return;
      let d = byPlate.get(norm(plate));
      if (!d) {
        d = { plate, type: String(g(r + 1, c + 3) ?? "").replace(/\s+/g, " ").trim(), category: String(g(r + 2, c + 3) ?? "").trim(), start: null, months: {} };
        byPlate.set(norm(plate), d); order.push(norm(plate));
      }
      if (month === 0 || d.start == null) d.start = n(g(r + 12, c + 1));
      // Évi km keret (E4) és olajcsere esedékes állása (E9): a legkésőbbi hónap értéke érvényes
      const key = `${norm(plate)}`;
      if (month >= (tableAt.get(key) ?? -1)) {
        const a = n(g(r + 3, c + 3)), o = n(g(r + 8, c + 3));
        if (a > 0) d.allowed = a;
        if (o > 0) d.oilDue = o;
        if (a > 0 || o > 0) tableAt.set(key, month);
      }
      const rows: Row[] = [];
      for (let rr = r + 13; rr <= r + 43; rr++) {
        if (typeof g(rr, c - 1) === "string") break;
        const s = g(rr, c);
        const [km, tk, sk, f, m] = [1, 2, 3, 4, 5].map((k) => g(rr, c + k));
        if ([s, km, f].some((v) => v != null && v !== 0)) {
          let previous = rows.at(-1)?.odometer ?? n(g(r + 12, c + 1));
          if (g(r + 12, c + 1) == null && !rows.length) {
            previous = d.start ?? 0;
            for (let prior = month - 1; prior >= 0; prior--) { const last = d.months[prior]?.at(-1); if (last) { previous = last.odometer; break; } }
          }
          rows.push({ id: uid(), docNo: s == null ? "" : String(s), odometer: n(km), km: tk == null ? Math.max(0, n(km) - previous) : n(tk), weightedKm: n(sk), fuel: n(f), diff: n(m), worksheetRow: rr - r - 13 });
        }
      }
      d.months[month] = rows;
    }));
  });
  // App-extra blokk beolvasása: a jelölő sor bárhol lehet (a táblázat alján, nem fix helyen)
  const extrasSeen = new Set<string>();
  for (const name of wb.SheetNames) {
    const sheetExtras = new Set<string>();
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
    const mi = grid.findIndex((row) => row?.some((c) => typeof c === "string" && c.trim() === EXTRAS_MARKER));
    if (mi < 0) continue;
    for (let r = mi + 2; r < grid.length; r++) {
      const row = grid[r];
      const plate = String(row?.[0] ?? "").trim();
      const kind = String(row?.[1] ?? "").trim();
      if (!plate || !kind) continue;
      if (kind !== "havi adat" && kind !== "havi adatok" && extrasSeen.has(norm(plate))) continue;
      sheetExtras.add(norm(plate));
      let d = byPlate.get(norm(plate));
      if (!d) { d = { plate, type: "", category: "", start: null, months: {} }; byPlate.set(norm(plate), d); order.push(norm(plate)); }
      const ex = (d.extras ??= { docs: [], services: [] });
      const v1 = String(row?.[2] ?? "").trim(), v2 = String(row?.[3] ?? "").trim(), v3 = String(row?.[4] ?? "").trim(), v4 = String(row?.[5] ?? "").trim();
      if (kind === "eszköz") { d.type = v1; d.category = v2; d.start = n(v3); }
      else if (kind === "okmányok és szervizek") ex.complete = true;
      else if (kind === "havi adatok") { const month = n(row?.[2]); if (month >= 0 && month < 12) d.months[month] = []; }
      else if (kind === "havi adat") {
        const month = n(row?.[2]);
        if (month >= 0 && month < 12) (d.months[month] ??= []).push({ id: uid(), docNo: String(row?.[3] ?? ""), odometer: n(row?.[4]), km: n(row?.[5]), weightedKm: n(row?.[6]), fuel: n(row?.[7]), diff: n(row?.[8]), ...(row?.[9] !== "" && row?.[9] != null ? { worksheetRow: n(row?.[9]) } : {}) });
      }
      else if (kind === "beállítás") {
        ex.unit = v1 === "üó" ? "üó" : "km";
        ex.norm = n(v2); ex.yearlyAllowed = n(v3);
        if (v4 === "H" || v4 === "NH" || v4 === "S") ex.status = v4;
      } else if (kind === "megjegyzés") ex.note = v1;
      else if (kind === "némítva") ex.muted = true;
      else if (kind === "törölve") { const m = n(row?.[2]); if (m >= 0 && m < 12) ex.removedFrom = m; }
      else if (kind === "okmány") ex.docs.push({ id: uid(), name: v1, number: v2, expiry: /^\d{4}-\d{2}-\d{2}$/.test(v3) ? v3 : "", hasNumber: v4[0] !== "0", hasDate: v4[1] !== "0" });
      else if (kind === "szerviz") ex.services.push({ id: uid(), name: v1, interval: n(v2), lastReading: n(v3) });
    }
    for (const plate of sheetExtras) extrasSeen.add(plate);
  }
  return order.flatMap((p) => { const d = byPlate.get(p); return d ? [d] : []; });
}

