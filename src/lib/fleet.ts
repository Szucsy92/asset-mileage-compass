import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import seedData from "@/data/seed.json";
import type { Service } from "./maintenance";
import type { WorkbookRef } from "./workbookLayout";

export const MONTHS = ["Január","Február","Március","Április","Május","Június","Július","Augusztus","Szeptember","Október","November","December"];

/** Okmány: a hasNumber/hasDate kapcsolók döntik el, mely mezők láthatók (alapértelmezés: mindkettő) */
export type Doc = { id: string; name: string; number: string; expiry: string; hasNumber?: boolean; hasDate?: boolean };
/** Egy bejegyzés (menetlevél / okmány sor) */
export type Row = { id: string; docNo: string; odometer: number; km: number; weightedKm: number; fuel: number; diff: number; worksheetRow?: number };
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
  services?: Service[];
  status?: "H" | "NH" | "S";
  note?: string;
  /** Értesítések némítása ennél az eszköznél */
  muted?: boolean;
  months: Record<number, Row[]>;
};
type State = { devices: Device[]; workbook?: WorkbookRef | undefined };

const KEY = "fleet-v2";
export const uid = () => Math.random().toString(36).slice(2, 10);

const defaultDocs = (): Doc[] => [
  { id: uid(), name: "Forgalmi engedély", number: "", expiry: "", hasNumber: true, hasDate: false },
  { id: uid(), name: "Műszaki vizsga", number: "", expiry: "", hasNumber: false, hasDate: true },
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

export type YearInfo = { year: number; closed: boolean };
type Store = State & { years: YearInfo[]; year: number | null; closed: boolean; status: "loading" | "ready" | "error" | "saving"; offline?: boolean; /** helyi módosítások száma (Drive-szinkronhoz) */ rev: number };

let store: Store = { devices: [], years: [], year: null, closed: false, status: "loading", rev: 0 };
let started = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const patchStore = (p: Partial<Store>) => { store = { ...store, ...p }; emit(); };

const clean = (s: State): State => ({ devices: s.devices, workbook: s.workbook });

// Offline-first helyi tár: az utolsó ismert állapot és a még fel nem küldött módosítás
const CACHE = "fleet-cache-v1";
type Cache = { years: YearInfo[]; year: number; closed: boolean; data: State; pending?: boolean };
function readCache(): Cache | null { try { const r = localStorage.getItem(CACHE); return r ? JSON.parse(r) : null; } catch { return null; } }
function writeCache(pending?: boolean) {
  if (store.year == null) return;
  try { localStorage.setItem(CACHE, JSON.stringify({ years: store.years, year: store.year, closed: store.closed, data: clean(store), pending: pending ?? readCache()?.pending })); } catch { /* tele a tár */ }
}
async function pushPending() {
  const c = readCache();
  if (!c?.pending || c.closed) return;
  const { error } = await supabase.from("fleet_years").update({ data: c.data as never, updated_at: new Date().toISOString() }).eq("year", c.year);
  if (!error) { writeCache(false); patchStore({ status: "ready", offline: false }); }
}

async function fetchYears() {
  const { data, error } = await supabase.from("fleet_years").select("year, closed").order("year");
  if (error) throw error;
  return data as YearInfo[];
}
export async function openYear(year: number) {
  patchStore({ status: "loading" });
  const { data, error } = await supabase.from("fleet_years").select("year, closed, data").eq("year", year).single();
  if (error) { patchStore({ status: "error" }); return; }
  patchStore({ year, closed: data.closed, ...clean(data.data as unknown as State), status: "ready", offline: false });
  writeCache(false);
}
async function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  const cached = readCache();
  if (cached) patchStore({ years: cached.years, year: cached.year, closed: cached.closed, ...clean(cached.data), status: "ready", offline: true });
  window.addEventListener("online", () => { void pushPending(); });
  try {
    await pushPending();
    if (readCache()?.pending) throw new Error("offline");
    let years = await fetchYears();
    if (!years.length) {
      let initial: State;
      try { const raw = localStorage.getItem(KEY); initial = raw ? JSON.parse(raw) : seed(); } catch { initial = seed(); }
      const y = new Date().getFullYear();
      await supabase.from("fleet_years").insert({ year: y, closed: false, data: clean(initial) as never });
      years = await fetchYears();
    }
    const open = years.filter((y) => !y.closed).at(-1) ?? years.at(-1);
    if (!open) throw new Error("Nincs megnyitható év");
    patchStore({ years });
    await openYear(open.year);
    // Élő frissítés: más által beírt változások azonnal megjelennek
    supabase.channel("fleet-years-live").on("postgres_changes", { event: "*", schema: "public", table: "fleet_years" }, async (p) => {
      const row = p.new as { year?: number; closed?: boolean; data?: unknown };
      if (p.eventType === "INSERT" || row.closed !== undefined) patchStore({ years: await fetchYears() });
      if (row.year !== store.year || store.status === "saving" || !row.data) return;
      if (readCache()?.pending) return;
      patchStore({ closed: !!row.closed, ...clean(row.data as State) });
      writeCache(false);
    }).subscribe();
  } catch { patchStore(cached ? { status: "ready", offline: true } : { status: "error" }); }
}
function set(next: State, bump = true) {
  if (store.closed || store.year == null) return;
  patchStore({ devices: next.devices, workbook: next.workbook ?? store.workbook, status: "saving", ...(bump ? { rev: store.rev + 1 } : {}) });
  writeCache(true);
  clearTimeout(saveTimer);
  const year = store.year;
  saveTimer = setTimeout(async () => {
    const { error } = await supabase.from("fleet_years").update({ data: clean(store) as never, updated_at: new Date().toISOString() }).eq("year", year);
    if (error) patchStore({ status: "ready", offline: true });
    else { writeCache(false); patchStore({ status: "ready", offline: false }); }
  }, 600);
}
const state = { get devices() { return store.devices; } };
const EMPTY: Store = { devices: [], years: [], year: null, closed: false, status: "loading", rev: 0 };
export function useFleet() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); void start(); return () => listeners.delete(l); },
    () => store,
    () => EMPTY,
  );
}

/** Év lezárása: a teljes év mentve és zárolva, új független év indul (eszközök, okmányok, nyitó állás átvéve) */
export async function closeYear() {
  if (store.year == null || store.closed) return;
  clearTimeout(saveTimer);
  const y = store.year;
  const devices = store.devices;
  const { error } = await supabase.from("fleet_years").update({ data: clean(store) as never, closed: true, closed_at: new Date().toISOString() }).eq("year", y);
  if (error) { patchStore({ status: "error" }); return; }
  const next: State = { devices: devices.map((d) => ({ ...d, startOdometer: lastOdometer(d), months: {} })) };
  const { error: e2 } = await supabase.from("fleet_years").insert({ year: y + 1, closed: false, data: next as never });
  if (e2) { patchStore({ status: "error" }); return; }
  patchStore({ years: await fetchYears() });
  await openYear(y + 1);
}

export function lastOdometer(d: Device, m = 11) {
  for (let i = m; i >= 0; i--) {
    const rows = d.months[i];
    if (rows?.length) return Math.max(...rows.map((r) => r.odometer));
  }
  return d.startOdometer;
}

export const actions = {
  replaceAll(devices: Device[], workbook?: WorkbookRef, bump = true) { set({ devices, workbook }, bump); },
  setWorkbook(workbook: WorkbookRef) { set({ devices: state.devices, workbook }, false); },
  move(from: number, to: number) {
    const list = [...state.devices];
    const [it] = list.splice(from, 1);
    if (it) { list.splice(to, 0, it); set({ devices: list }); }
  },
  add(d: Device) { set({ devices: [...state.devices, d] }); },
  remove(id: string) { set({ devices: state.devices.filter((d) => d.id !== id) }); },
  update(id: string, patch: Partial<Device>) {
    set({ devices: state.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)) });
  },
  setRows(id: string, m: number, rows: Row[]) {
    const d = state.devices.find((x) => x.id === id);
    if (d) actions.update(id, { months: { ...d.months, [m]: rows } });
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
