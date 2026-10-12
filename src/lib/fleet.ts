import { useSyncExternalStore } from "react";
import seedData from "@/data/seed.json";

export const MONTHS = ["Január","Február","Március","Április","Május","Június","Július","Augusztus","Szeptember","Október","November","December"];

export type Doc = { id: string; name: string; number: string; expiry: string };
/** Egy bejegyzés (menetlevél / okmány sor) */
export type Row = { id: string; docNo: string; odometer: number; km: number; weightedKm: number; fuel: number; diff: number };
export type Device = {
  id: string;
  plate: string;
  type: string;
  category: string;
  unit: "km" | "üó";
  norm: number;
  yearlyAllowed: number;
  startOdometer: number;
  docs: Doc[];
  months: Record<number, Row[]>;
};
type State = { devices: Device[] };

const KEY = "fleet-v2";
export const uid = () => Math.random().toString(36).slice(2, 10);

const defaultDocs = (): Doc[] => [
  { id: uid(), name: "Forgalmi engedély", number: "", expiry: "" },
  { id: uid(), name: "Műszaki vizsga", number: "", expiry: "" },
  { id: uid(), name: "Kötelező biztosítás", number: "", expiry: "" },
];

export const newDevice = (plate: string, type: string): Device => ({
  id: uid(), plate, type, category: "", unit: "km", norm: 0, yearlyAllowed: 0, startOdometer: 0, docs: defaultDocs(), months: {},
});

type SeedRow = Omit<Row, "id">;
type SeedDev = { plate: string; type: string; category: string; unit: string; start: number; months: Record<string, SeedRow[]> };
const seed = (): State => ({
  devices: (seedData as SeedDev[]).map((s) => ({
    ...newDevice(s.plate, s.type),
    category: s.category,
    unit: s.unit === "üó" ? "üó" : "km",
    startOdometer: s.start,
    months: Object.fromEntries(Object.entries(s.months).map(([k, rows]) => [Number(k), rows.map((r) => ({ ...r, id: uid() }))])),
  })),
});

let state: State = { devices: [] };
let loaded = false;
const listeners = new Set<() => void>();
function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try { const raw = localStorage.getItem(KEY); state = raw ? JSON.parse(raw) : seed(); } catch { state = seed(); }
}
function set(next: State) {
  state = next;
  localStorage.setItem(KEY, JSON.stringify(state));
  listeners.forEach((l) => l());
}
const EMPTY: State = { devices: [] };
export function useFleet() {
  return useSyncExternalStore(
    (l) => { load(); listeners.add(l); l(); return () => listeners.delete(l); },
    () => { load(); return state; },
    () => EMPTY,
  );
}

export function lastOdometer(d: Device, m = 11) {
  for (let i = m; i >= 0; i--) {
    const rows = d.months[i];
    if (rows?.length) return Math.max(...rows.map((r) => r.odometer));
  }
  return d.startOdometer;
}

export const actions = {
  add(d: Device) { set({ devices: [...state.devices, d] }); },
  remove(id: string) { set({ devices: state.devices.filter((d) => d.id !== id) }); },
  update(id: string, patch: Partial<Device>) {
    set({ devices: state.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)) });
  },
  setRows(id: string, m: number, rows: Row[]) {
    const d = state.devices.find((x) => x.id === id);
    if (d) actions.update(id, { months: { ...d.months, [m]: rows } });
  },
  /** Új év: csak a havi adatok törlődnek, a nyitó állás az utolsó ismert állás lesz */
  resetYear() {
    set({ devices: state.devices.map((d) => ({ ...d, startOdometer: lastOdometer(d), months: {} })) });
  },
};

export function latestUpTo(d: Device, m: number): number | null {
  for (let i = m; i >= 0; i--) if (d.months[i]?.length) return i;
  return null;
}
export function monthStats(d: Device, m: number) {
  const rows = d.months[m] ?? [];
  return rows.reduce(
    (a, r) => ({ km: a.km + r.km, weightedKm: a.weightedKm + r.weightedKm, fuel: a.fuel + r.fuel, diff: a.diff + r.diff }),
    { km: 0, weightedKm: 0, fuel: 0, diff: 0 },
  );
}
export function cumulative(d: Device, m: number) {
  const t = { km: 0, weightedKm: 0, fuel: 0, diff: 0 };
  for (let i = 0; i <= m; i++) {
    const s = monthStats(d, i);
    t.km += s.km; t.weightedKm += s.weightedKm; t.fuel += s.fuel; t.diff += s.diff;
  }
  return t;
}
export function daysLeft(expiry: string) {
  if (!expiry) return null;
  const t = new Date(expiry + "T00:00:00").getTime();
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((t - now.getTime()) / 86400000);
}
export const expiryState = (days: number | null) =>
  days == null ? "none" : days < 0 ? "expired" : days <= 30 ? "soon" : "ok";
