import type { Device } from "./fleet";

/** dueAt: a táblázatban (E9) megadott esedékes állás; érvényes, amíg új szerviz/ciklus nem kerül az appba */
export type Service = { id: string; name: string; interval: number; lastReading: number; dueAt?: number };
export const isOilService = (name: string) => /olaj/i.test(name);
export function serviceDue(service: Service): number | null {
  if (service.dueAt != null && service.dueAt > 0) return service.dueAt;
  if (!Number.isFinite(service.interval) || service.interval <= 0) return null;
  return service.lastReading + service.interval;
}
/** Az olajcsere esedékes állása (a táblázat E9 cellája) */
export const oilDue = (d: Device) => { const s = (d.services ?? []).find((x) => isOilService(x.name)); return s ? serviceDue(s) : null; };
const soonLimit = (unit: Device["unit"]) => (unit === "km" ? 1000 : 100);
/** Éves km keret: hátralévő érték és állapot (a táblázat F4 cellájával egyező számítás) */
export function yearStats(allowed: number, used: number, unit: Device["unit"]) {
  if (!allowed || allowed <= 0) return { remaining: null, state: "none" as const };
  const remaining = allowed - used;
  return { remaining, state: remaining < 0 ? "overdue" as const : remaining <= soonLimit(unit) ? "soon" as const : "ok" as const };
}
export function serviceStats(service: Service, reading: number, unit: Device["unit"]) {
  const due = serviceDue(service);
  if (due == null) return { due: null, remaining: null, state: "none" as const };
  const remaining = due - reading;
  const state = remaining < 0 ? "overdue" : remaining <= soonLimit(unit) ? "soon" : "ok";
  return { due, remaining, state };
}

export function compareDeadlines(a: number, b: number) {
  if ((a < 0) !== (b < 0)) return a < 0 ? 1 : -1;
  return a < 0 ? b - a : a - b;
}