import { MONTHS, uid, type Device, type Row } from "@/lib/fleet";
import { norm } from "@/components/WheelPicker";

export const SHEET_ID = "1QnJ_WdDHREUE-yNeecTToN_ik3n0yDXKijeKKhE7G1g";
export const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;

type Cell = string | number;
export const MONTH_HEADER = ["Év", "Rendszám / azonosító", "Típus", "Egység", "Hónap", "Bizonylat", "Óraállás", "Megtett", "Súlyozott", "Üzemanyag (l)", "Eltérés (l)"];
export const DEVICE_HEADER = ["Év", "Rendszám / azonosító", "Típus", "Egység", "Nyitó állás", "Okmányok"];

export function toSheetRows(devices: Device[], year: number) {
  const monthly: Cell[][] = [MONTH_HEADER];
  for (const d of devices)
    for (let m = 0; m < 12; m++)
      for (const r of d.months[m] ?? []) monthly.push([year, d.plate, d.type, d.unit, MONTHS[m] ?? "", r.docNo, r.odometer, r.km, r.weightedKm, r.fuel, r.diff]);
  const devs: Cell[][] = [DEVICE_HEADER];
  for (const d of devices) devs.push([year, d.plate, d.type, d.unit, d.startOdometer, d.docs.map((x) => [x.name, x.number, x.expiry].filter(Boolean).join(" ")).join("; ")]);
  return { monthly, devs };
}

const num = (v: unknown) => { const x = Number(String(v ?? "").replace(/\s/g, "").replace(",", ".")); return Number.isFinite(x) ? x : 0; };

/** A táblázat havi sorainak visszaolvasása: rendszám szerint párosít, a sorrend és az okmányok nem változnak */
export function mergeSheetRows(devices: Device[], values: unknown[][], year: number) {
  const byPlate = new Map<string, Record<number, Row[]>>();
  for (const row of values.slice(1)) {
    if (num(row[0]) !== year) continue;
    const plate = norm(String(row[1] ?? ""));
    const m = MONTHS.findIndex((x) => norm(x) === norm(String(row[4] ?? "")));
    if (!plate || m < 0) continue;
    const months = byPlate.get(plate) ?? {};
    (months[m] ??= []).push({ id: uid(), docNo: String(row[5] ?? ""), odometer: num(row[6]), km: num(row[7]), weightedKm: num(row[8]), fuel: num(row[9]), diff: num(row[10]) });
    byPlate.set(plate, months);
  }
  let updated = 0;
  const next = devices.map((d) => {
    const months = byPlate.get(norm(d.plate));
    if (!months) return d;
    updated++;
    return { ...d, months };
  });
  return { devices: next, updated, unknown: [...byPlate.keys()].filter((p) => !devices.some((d) => norm(d.plate) === p)).length };
}
