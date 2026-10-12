import { useSyncExternalStore } from "react";

export const MONTHS = ["Január","Február","Március","Április","Május","Június","Július","Augusztus","Szeptember","Október","November","December"];

export type Doc = { id: string; name: string; number: string; expiry: string };
export type MonthEntry = {
  odometer: number | null; // km / üzemóra állás hó végén
  fuelIn: number | null; // tankolt (l)
  fuelUsed: number | null; // tényleges fogyasztás (l)
  note: string;
};
export type Device = {
  id: string;
  plate: string;
  type: string;
  category: string;
  unit: "km" | "üó";
  norm: number; // l / 100km vagy l / üó
  yearlyAllowed: number;
  startOdometer: number;
  docs: Doc[];
  months: Record<number, MonthEntry>;
};
type State = { devices: Device[] };

const KEY = "fleet-v1";
const uid = () => Math.random().toString(36).slice(2, 10);

const defaultDocs = (): Doc[] => [
  { id: uid(), name: "Forgalmi engedély", number: "", expiry: "" },
  { id: uid(), name: "Műszaki vizsga", number: "", expiry: "" },
  { id: uid(), name: "Kötelező biztosítás", number: "", expiry: "" },
];

export const newDevice = (plate: string, type: string): Device => ({
  id: uid(), plate, type, category: "", unit: "km", norm: 0, yearlyAllowed: 0, startOdometer: 0, docs: defaultDocs(), months: {},
});

const seed = (): State => ({
  devices: [
    { ...newDevice("HA 00-157", "Suzuki Vitara"), startOdometer: 52217 },
    newDevice("HA 02-18", "Opel Astra G"),
    newDevice("HK 30-34", "VW T4 Mixtó"),
    newDevice("GSE-121", "VW T4"),
    newDevice("HB 51-48", "VW T6 Minibusz"),
  ],
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
export const actions = {
  add(d: Device) { set({ devices: [...state.devices, d] }); },
  remove(id: string) { set({ devices: state.devices.filter((d) => d.id !== id) }); },
  update(id: string, patch: Partial<Device>) {
    set({ devices: state.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)) });
  },
  setMonth(id: string, m: number, entry: MonthEntry) {
    const d = state.devices.find((x) => x.id === id);
    if (d) actions.update(id, { months: { ...d.months, [m]: entry } });
  },
};

/** Legutóbbi bejegyzés m hónapig (göngyölítés) */
export function latestUpTo(d: Device, m: number): { month: number; entry: MonthEntry } | null {
  for (let i = m; i >= 0; i--) if (d.months[i]) return { month: i, entry: d.months[i] };
  return null;
}
function prevOdo(d: Device, m: number) {
  for (let i = m - 1; i >= 0; i--) if (d.months[i]?.odometer != null) return d.months[i].odometer!;
  return d.startOdometer;
}
export function monthStats(d: Device, m: number) {
  const e = d.months[m];
  const start = prevOdo(d, m);
  const used = e?.odometer != null ? Math.max(0, e.odometer - start) : 0;
  const normFuel = d.unit === "km" ? (used * d.norm) / 100 : used * d.norm;
  const actual = e?.fuelUsed ?? 0;
  return { start, used, normFuel, actual, diff: e ? normFuel - actual : 0 };
}
export function cumulative(d: Device, m: number) {
  let used = 0, normFuel = 0, actual = 0, fuelIn = 0;
  for (let i = 0; i <= m; i++) {
    const s = monthStats(d, i);
    used += s.used; normFuel += s.normFuel; actual += s.actual; fuelIn += d.months[i]?.fuelIn ?? 0;
  }
  return { used, normFuel, actual, fuelIn, diff: normFuel - actual };
}
export function daysLeft(expiry: string) {
  if (!expiry) return null;
  const t = new Date(expiry + "T00:00:00").getTime();
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((t - now.getTime()) / 86400000);
}
export const expiryState = (days: number | null) =>
  days == null ? "none" : days < 0 ? "expired" : days <= 30 ? "soon" : "ok";
export { uid };
